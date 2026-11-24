"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { checkbox, currencyCode, decimalStr, intStr, isoDate, money, optDate, optId, optMoney, optStr } from "@/lib/validation";
import { MANUAL_ASSET_TYPES, MANUAL_LIABILITY_TYPES } from "@/lib/finance/networth";
import { LOAN_TYPES, computeEMI } from "@/lib/finance/loans";
import { addMonths } from "@/lib/finance/dates";
import { deleteTransactions } from "@/lib/server/services/transactions";
import { backfillSnapshots, recordCurrentSnapshot } from "@/lib/server/services/snapshots";
import { getCtx } from "@/lib/server/data";

const assetSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(MANUAL_ASSET_TYPES, { message: "Choose an asset type" }),
  currency: currencyCode,
  currentValue: money("Current value", { positive: true }),
  valuationDate: isoDate("Valuation date"),
  purchaseValue: optMoney("Purchase value"),
  purchaseDate: optDate("Purchase date"),
  notes: optStr(1000),
});

export async function saveAsset(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(assetSchema, fd);
    if (p.error) return p.error;
    const { id, ...d } = p.data;
    const data = { ...d, currentValue: big(d.currentValue), purchaseValue: big(d.purchaseValue) };
    if (id) {
      const r = await db.asset.updateMany({ where: { id, userId: user.id }, data });
      if (!r.count) return fail("Asset not found");
    } else await db.asset.create({ data: { ...data, userId: user.id } });
    await audit(user.id, id ? "asset.update" : "asset.create", "Asset", id);
    revalidateAll();
    return ok(id ? "Asset updated" : "Asset added");
  });
}

export async function deleteAsset(id: string) {
  const user = await requireUser();
  await db.asset.deleteMany({ where: { id, userId: user.id } });
  await audit(user.id, "asset.delete", "Asset", id);
  revalidateAll();
  return ok("Asset deleted");
}

const liabilitySchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Name is required").max(80),
  type: z.enum(MANUAL_LIABILITY_TYPES),
  currency: currencyCode,
  outstanding: money("Outstanding", { positive: true }),
  interestRate: decimalStr("Interest rate", { optional: true, min: 0, max: 100 }),
  asOfDate: isoDate("As-of date"),
  notes: optStr(1000),
});

export async function saveLiability(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(liabilitySchema, fd);
    if (p.error) return p.error;
    const { id, ...d } = p.data;
    const data = { ...d, outstanding: big(d.outstanding) };
    if (id) {
      const r = await db.liability.updateMany({ where: { id, userId: user.id }, data });
      if (!r.count) return fail("Liability not found");
    } else await db.liability.create({ data: { ...data, userId: user.id } });
    revalidateAll();
    return ok(id ? "Liability updated" : "Liability added");
  });
}

export async function deleteLiability(id: string) {
  const user = await requireUser();
  await db.liability.deleteMany({ where: { id, userId: user.id } });
  revalidateAll();
  return ok("Liability deleted");
}

const loanSchema = z.object({
  name: z.string().trim().min(1, "Loan name is required").max(80),
  lender: optStr(80),
  loanType: z.enum(LOAN_TYPES),
  currency: currencyCode,
  principal: money("Sanctioned amount", { positive: true }),
  interestRate: decimalStr("Interest rate", { min: 0, max: 60 }),
  tenureMonths: intStr("Tenure", 1, 480),
  startDate: isoDate("Start date"),
  emi: optMoney("EMI"),
  emiDay: intStr("EMI day", 1, 28),
  mode: z.enum(["EXISTING", "NEW"]),
  outstanding: optMoney("Current outstanding"),
  asOfDate: optDate("As-of date"),
  disburseToAccountId: optId,
  createEmiSchedule: checkbox,
  emiAccountId: optId,
  autoPostEmi: checkbox,
  notes: optStr(1000),
});

/**
 * A loan is backed by a LOAN account whose (negative) balance is the outstanding
 * principal — so net worth, debt reports and repayments all share one figure.
 *  EXISTING: opening balance = −outstanding as of the given date
 *  NEW:      zero opening + a LOAN_DISBURSEMENT into the chosen bank account
 */
export async function createLoan(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(loanSchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    const rate = Number(d.interestRate);
    const emi = d.emi ?? computeEMI(d.principal, rate, d.tenureMonths);
    if (d.mode === "NEW" && !d.disburseToAccountId) return fail("Choose the account that receives the loan", { disburseToAccountId: "Required" });
    if (d.mode === "EXISTING" && d.outstanding == null) return fail("Enter the current outstanding principal", { outstanding: "Required" });
    if (d.createEmiSchedule && !d.emiAccountId) return fail("Choose the account EMIs are paid from", { emiAccountId: "Required" });
    for (const id of [d.disburseToAccountId, d.emiAccountId].filter(Boolean) as string[]) {
      if (!(await db.account.findFirst({ where: { id, userId: user.id } }))) return fail("Account not found");
    }
    const loan = await db.$transaction(async (tx) => {
      const openingDate = d.mode === "EXISTING" ? (d.asOfDate ?? d.startDate) : d.startDate;
      const acc = await tx.account.create({
        data: {
          userId: user.id,
          name: d.name,
          institution: d.lender,
          type: "LOAN",
          currency: d.currency,
          openingBalance: big(d.mode === "EXISTING" ? -(d.outstanding ?? d.principal) : 0),
          openingDate,
          notes: d.notes,
        },
      });
      const l = await tx.loan.create({
        data: {
          userId: user.id,
          accountId: acc.id,
          name: d.name,
          lender: d.lender,
          loanType: d.loanType,
          principal: big(d.principal),
          interestRate: d.interestRate!,
          tenureMonths: d.tenureMonths,
          startDate: d.startDate,
          emi: big(emi),
          emiDay: d.emiDay,
          notes: d.notes,
        },
      });
      if (d.mode === "NEW") {
        await tx.transaction.create({
          data: {
            userId: user.id,
            type: "LOAN_DISBURSEMENT",
            amount: big(d.principal),
            currency: d.currency,
            date: d.startDate,
            accountId: acc.id,
            toAccountId: d.disburseToAccountId!,
            description: `${d.name} disbursement`,
            loanId: l.id,
          },
        });
      }
      if (d.createEmiSchedule) {
        const first = `${(d.asOfDate ?? d.startDate).slice(0, 8)}${String(d.emiDay).padStart(2, "0")}`;
        const start = first <= (d.asOfDate ?? d.startDate) ? addMonths(first, 1) : first;
        const interestCat = await tx.category.findFirst({ where: { userId: user.id, name: "Loan interest" } });
        await tx.recurringRule.create({
          data: {
            userId: user.id,
            name: `${d.name} EMI`,
            kind: "EMI",
            billType: "EMI",
            txType: "LOAN_REPAYMENT",
            amount: big(emi),
            currency: d.currency,
            accountId: d.emiAccountId!,
            toAccountId: acc.id,
            categoryId: interestCat?.id ?? null,
            merchant: d.lender,
            paymentMethod: "AUTO_DEBIT",
            frequency: "MONTHLY",
            startDate: start,
            autoPost: d.autoPostEmi,
            reminderDays: 3,
            loanId: l.id,
          },
        });
      }
      return l;
    });
    await audit(user.id, "loan.create", "Loan", loan.id);
    revalidateAll();
    return ok("Loan added", { id: loan.id });
  });
}

const loanUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  lender: optStr(80),
  interestRate: decimalStr("Interest rate", { min: 0, max: 60 }),
  emi: money("EMI", { positive: true }),
  emiDay: intStr("EMI day", 1, 28),
  tenureMonths: intStr("Tenure", 1, 480),
  status: z.enum(["ACTIVE", "CLOSED"]),
  notes: optStr(1000),
});

export async function updateLoan(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(loanUpdateSchema, fd);
    if (p.error) return p.error;
    const { id, ...d } = p.data;
    const loan = await db.loan.findFirst({ where: { id, userId: user.id } });
    if (!loan) return fail("Loan not found");
    await db.$transaction([
      db.loan.update({ where: { id }, data: { ...d, interestRate: d.interestRate!, emi: big(d.emi) } }),
      db.account.update({ where: { id: loan.accountId }, data: { name: d.name, institution: d.lender, status: d.status } }),
      db.recurringRule.updateMany({ where: { loanId: id, userId: user.id }, data: { amount: big(d.emi), active: d.status === "ACTIVE" } }),
    ]);
    await audit(user.id, "loan.update", "Loan", id);
    revalidateAll();
    return ok("Loan updated");
  });
}

export async function deleteLoan(id: string) {
  const user = await requireUser();
  return run(async () => {
    const loan = await db.loan.findFirst({ where: { id, userId: user.id } });
    if (!loan) return fail("Loan not found");
    const txIds = (
      await db.transaction.findMany({ where: { userId: user.id, OR: [{ accountId: loan.accountId }, { toAccountId: loan.accountId }] }, select: { id: true } })
    ).map((t) => t.id);
    await deleteTransactions(user.id, txIds);
    await db.recurringRule.deleteMany({ where: { loanId: id, userId: user.id } });
    await db.account.delete({ where: { id: loan.accountId } }); // cascades the Loan row
    await audit(user.id, "loan.delete", "Loan", id, { transactionsDeleted: txIds.length });
    revalidateAll();
    return { ok: true as const, message: "Loan deleted", redirect: "/wealth/loans" };
  });
}

export async function backfillHistory() {
  const user = await requireUser();
  return run(async () => {
    const ctx = await getCtx(user.id);
    await recordCurrentSnapshot(ctx);
    const c = await backfillSnapshots(ctx);
    revalidateAll();
    return ok(c ? `Estimated ${c} past month${c === 1 ? "" : "s"} from your transaction history` : "History is already complete");
  });
}

export async function recordSnapshotNow() {
  const user = await requireUser();
  const ctx = await getCtx(user.id);
  await recordCurrentSnapshot(ctx);
  revalidateAll();
  return ok("Snapshot recorded for this month");
}
