"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { currencyCode, decimalStr, isoDate, optDate, optId, optMoney, optStr } from "@/lib/validation";
import { ASSET_CLASSES, INV_TX_TYPES } from "@/lib/finance/investments";
import { deleteInvestmentTx, recordInvestmentTx } from "@/lib/server/services/investments";

const holdingSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Name is required").max(120),
  symbol: optStr(30),
  isin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((v) => !v || /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v), "ISIN must be 12 characters (e.g. INE002A01018)")
    .transform((v) => v || null),
  exchange: optStr(10),
  assetClass: z.enum(ASSET_CLASSES),
  valuationMode: z.enum(["UNITS", "VALUE"]),
  currency: currencyCode,
  accountId: optId,
  interestRate: decimalStr("Interest rate", { optional: true, min: 0, max: 50 }),
  maturityDate: optDate("Maturity date"),
  notes: optStr(1000),
});

export async function saveHolding(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(holdingSchema, fd);
    if (p.error) return p.error;
    const { id, ...d } = p.data;
    if (d.accountId && !(await db.account.findFirst({ where: { id: d.accountId, userId: user.id } }))) return fail("Account not found");
    if (id) {
      const h = await db.investmentHolding.findFirst({ where: { id, userId: user.id }, include: { _count: { select: { transactions: true } } } });
      if (!h) return fail("Holding not found");
      if (h._count.transactions && h.valuationMode !== d.valuationMode) return fail("Valuation mode can't change after transactions are recorded");
      await db.investmentHolding.update({ where: { id }, data: d });
      revalidateAll();
      return ok("Holding updated");
    }
    const h = await db.investmentHolding.create({ data: { ...d, userId: user.id } });
    await audit(user.id, "holding.create", "InvestmentHolding", h.id);
    revalidateAll();
    return { ok: true as const, message: "Holding added — now record a purchase or opening position", redirect: `/investments/${h.id}` };
  });
}

export async function deleteHolding(id: string) {
  const user = await requireUser();
  return run(async () => {
    const h = await db.investmentHolding.findFirst({ where: { id, userId: user.id }, include: { transactions: true } });
    if (!h) return fail("Holding not found");
    const cashIds = h.transactions.map((t) => t.cashTransactionId).filter(Boolean) as string[];
    await db.$transaction([
      db.investmentHolding.delete({ where: { id } }),
      db.transaction.deleteMany({ where: { id: { in: cashIds }, userId: user.id } }),
    ]);
    await audit(user.id, "holding.delete", "InvestmentHolding", id, { cashTransactionsDeleted: cashIds.length });
    revalidateAll();
    return { ok: true as const, message: "Holding deleted", redirect: "/investments/holdings" };
  });
}

const priceSchema = z.object({
  holdingId: z.string().min(1),
  price: decimalStr("Price", { optional: true, min: 0 }),
  value: optMoney("Current value"),
  date: isoDate("Price date"),
});

/** Manual valuation update — stored with its date and labelled as manually entered. */
export async function updatePrice(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(priceSchema, fd);
    if (p.error) return p.error;
    const h = await db.investmentHolding.findFirst({ where: { id: p.data.holdingId, userId: user.id } });
    if (!h) return fail("Holding not found");
    if (h.valuationMode === "UNITS" && !p.data.price) return fail("Enter the price per unit", { price: "Required" });
    if (h.valuationMode === "VALUE" && p.data.value == null) return fail("Enter the current value", { value: "Required" });
    await db.$transaction([
      db.investmentHolding.update({
        where: { id: h.id },
        data:
          h.valuationMode === "UNITS"
            ? { currentPrice: p.data.price, priceDate: p.data.date, priceSource: "MANUAL" }
            : { currentValue: big(p.data.value), priceDate: p.data.date, priceSource: "MANUAL" },
      }),
      db.priceUpdate.create({
        data: { holdingId: h.id, date: p.data.date, price: p.data.price, value: big(p.data.value), source: "MANUAL" },
      }),
    ]);
    revalidateAll();
    return ok("Valuation updated");
  });
}

const invTxSchema = z.object({
  holdingId: z.string().min(1, "Choose a holding"),
  type: z.enum(INV_TX_TYPES),
  date: isoDate(),
  quantity: decimalStr("Quantity", { optional: true, min: 0 }),
  price: decimalStr("Price", { optional: true, min: 0 }),
  amount: optMoney("Amount"),
  fees: optMoney("Fees"),
  ratio: decimalStr("Ratio", { optional: true, min: 0 }),
  cashAccountId: optId,
  notes: optStr(500),
});

export async function saveInvestmentTx(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(invTxSchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    const created = await db.$transaction((tx) =>
      recordInvestmentTx(tx, user.id, {
        holdingId: d.holdingId,
        type: d.type,
        date: d.date,
        quantity: d.quantity,
        price: d.price,
        amount: d.amount,
        fees: d.fees ?? 0,
        ratio: d.ratio,
        cashAccountId: d.cashAccountId,
        notes: d.notes,
      }),
    );
    await audit(user.id, "investment_tx.create", "InvestmentTransaction", created.id, { type: d.type });
    revalidateAll();
    return ok(d.cashAccountId ? "Recorded — cash movement posted to the ledger" : "Recorded (no cash movement posted)");
  });
}

export async function deleteInvestmentTransaction(id: string) {
  const user = await requireUser();
  return run(async () => {
    await db.$transaction((tx) => deleteInvestmentTx(tx, user.id, id));
    await audit(user.id, "investment_tx.delete", "InvestmentTransaction", id);
    revalidateAll();
    return ok("Investment transaction deleted");
  });
}

const benchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  startDate: isoDate("Start date"),
  startValue: decimalStr("Start value", { min: 0.0001 }),
  endDate: isoDate("End date"),
  endValue: decimalStr("End value", { min: 0.0001 }),
});

export async function saveBenchmark(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(benchSchema, fd);
    if (p.error) return p.error;
    if (p.data.endDate <= p.data.startDate) return fail("End date must be after start date", { endDate: "Invalid" });
    await db.benchmark.create({ data: { ...p.data, startValue: p.data.startValue!, endValue: p.data.endValue!, userId: user.id } });
    revalidateAll();
    return ok("Benchmark saved");
  });
}

export async function deleteBenchmark(id: string) {
  const user = await requireUser();
  await db.benchmark.deleteMany({ where: { id, userId: user.id } });
  revalidateAll();
  return ok("Benchmark removed");
}
