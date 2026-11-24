"use server";

import { z } from "zod";
import { db, big, n } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { checkbox, currencyCode, isoDate, money, optMoney, optStr } from "@/lib/validation";
import { accountBalances, balanceEffects } from "@/lib/finance/ledger";
import type { TxType } from "@/lib/finance/types";
import { getCtx } from "@/lib/server/data";
import { deleteTransactions } from "@/lib/server/services/transactions";

const ACCOUNT_FORM_TYPES = ["SAVINGS", "CURRENT", "CASH", "WALLET", "CREDIT_CARD", "INVESTMENT", "FOREIGN_CURRENCY"] as const;

const accountSchema = z.object({
  id: optStr(64),
  name: z.string().trim().min(1, "Account name is required").max(80),
  institution: optStr(80),
  type: z.enum(ACCOUNT_FORM_TYPES, { message: "Choose an account type" }),
  currency: currencyCode,
  openingBalance: money("Opening balance", { allowNegative: true }),
  openingDate: isoDate("Opening date"),
  maskedNumber: z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const digits = v.replace(/\D/g, "");
      if (digits.length < 4) {
        ctx.addIssue({ code: "custom", message: "Enter the last 4 digits" });
        return z.NEVER;
      }
      return digits.slice(-4); // never store more than the last 4 digits
    }),
  creditLimit: optMoney("Credit limit"),
  includeInNetWorth: checkbox,
  notes: optStr(1000),
});

export async function saveAccount(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    if (!fd.has("includeInNetWorth") && fd.get("_hasNW") === "1") fd.set("includeInNetWorth", "false");
    const p = parseWith(accountSchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    // Credit card: user enters the amount OWED (positive) → stored as a negative balance.
    const opening = d.type === "CREDIT_CARD" ? -Math.abs(d.openingBalance) : d.openingBalance;
    const data = {
      name: d.name,
      institution: d.institution,
      type: d.type,
      currency: d.currency,
      openingBalance: big(opening),
      openingDate: d.openingDate,
      maskedNumber: d.maskedNumber,
      creditLimit: d.type === "CREDIT_CARD" ? big(d.creditLimit) : null,
      includeInNetWorth: fd.get("_hasNW") === "1" ? d.includeInNetWorth : true,
      notes: d.notes,
    };
    if (d.id) {
      const existing = await db.account.findFirst({ where: { id: d.id, userId: user.id } });
      if (!existing) return fail("Account not found");
      if (existing.type === "LOAN") return fail("Edit loan accounts from Wealth → Loans");
      const used = await db.transaction.count({ where: { OR: [{ accountId: d.id }, { toAccountId: d.id }] } });
      if (used && existing.currency !== d.currency) return fail("Currency can't change once the account has transactions", { currency: "Locked" });
      await db.account.update({ where: { id: d.id }, data });
      await audit(user.id, "account.update", "Account", d.id);
      revalidateAll();
      return ok("Account updated");
    }
    const a = await db.account.create({ data: { ...data, userId: user.id } });
    await audit(user.id, "account.create", "Account", a.id, { type: d.type });
    revalidateAll();
    return ok("Account created", { id: a.id });
  });
}

export async function setAccountStatus(id: string, status: "ACTIVE" | "CLOSED") {
  const user = await requireUser();
  return run(async () => {
    const r = await db.account.updateMany({ where: { id, userId: user.id }, data: { status } });
    if (!r.count) return fail("Account not found");
    await audit(user.id, `account.${status === "CLOSED" ? "close" : "reopen"}`, "Account", id);
    revalidateAll();
    return ok(status === "CLOSED" ? "Account closed — history is kept" : "Account reopened");
  });
}

export async function deleteAccount(id: string) {
  const user = await requireUser();
  return run(async () => {
    const acc = await db.account.findFirst({ where: { id, userId: user.id }, include: { loan: true } });
    if (!acc) return fail("Account not found");
    const txIds = (
      await db.transaction.findMany({ where: { userId: user.id, OR: [{ accountId: id }, { toAccountId: id }] }, select: { id: true } })
    ).map((t) => t.id);
    if (txIds.length) await deleteTransactions(user.id, txIds);
    await db.investmentHolding.updateMany({ where: { accountId: id, userId: user.id }, data: { accountId: null } });
    await db.account.delete({ where: { id } });
    await audit(user.id, "account.delete", "Account", id, { transactionsDeleted: txIds.length });
    revalidateAll();
    return { ok: true as const, message: `Account deleted with ${txIds.length} transaction${txIds.length === 1 ? "" : "s"}`, redirect: "/accounts" };
  });
}

const adjustSchema = z.object({
  accountId: z.string().min(1),
  actualBalance: money("Actual balance", { allowNegative: true }),
  date: isoDate(),
  note: optStr(300),
});

/** Manual balance correction: posts an ADJUSTMENT for the difference (never touches income/expense). */
export async function adjustBalance(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(adjustSchema, fd);
    if (p.error) return p.error;
    const ctx = await getCtx(user.id);
    const acc = ctx.accountById.get(p.data.accountId);
    if (!acc) return fail("Account not found");
    const current = accountBalances([acc], ctx.txsNative, p.data.date).get(acc.id) ?? 0;
    const target = acc.type === "CREDIT_CARD" || acc.type === "LOAN" ? -Math.abs(p.data.actualBalance) : p.data.actualBalance;
    const diff = target - current;
    if (diff === 0) return ok("Balance already matches — no adjustment needed");
    await db.transaction.create({
      data: {
        userId: user.id,
        type: "ADJUSTMENT",
        amount: big(diff),
        currency: acc.currency,
        date: p.data.date,
        accountId: acc.id,
        description: "Balance adjustment",
        notes: p.data.note,
      },
    });
    await audit(user.id, "account.adjust", "Account", acc.id, { diff });
    revalidateAll();
    return ok("Balance adjusted");
  });
}

const reconcileSchema = z.object({
  accountId: z.string().min(1),
  statementDate: isoDate("Statement date"),
  statementBalance: money("Statement balance", { allowNegative: true }),
  cleared: z.array(z.string()).optional().default([]),
  createAdjustment: checkbox,
});

export async function completeReconciliation(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(reconcileSchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    const acc = await db.account.findFirst({ where: { id: d.accountId, userId: user.id } });
    if (!acc) return fail("Account not found");
    const statement = acc.type === "CREDIT_CARD" || acc.type === "LOAN" ? -Math.abs(d.statementBalance) : d.statementBalance;
    return db.$transaction(async (tx) => {
      const txs = await tx.transaction.findMany({
        where: { userId: user.id, OR: [{ accountId: acc.id }, { toAccountId: acc.id }], date: { lte: d.statementDate } },
      });
      const clearedSet = new Set(d.cleared);
      // Cleared balance = opening + effects of transactions already cleared earlier or ticked now.
      let cleared = acc.openingDate <= d.statementDate ? n(acc.openingBalance) : 0;
      for (const t of txs) {
        if (!(t.cleared || clearedSet.has(t.id))) continue;
        const rec = {
          ...t,
          type: t.type as TxType,
          amount: n(t.amount),
          toAmount: n(t.toAmount),
          principalAmount: n(t.principalAmount),
          interestAmount: n(t.interestAmount),
        };
        for (const e of balanceEffects(rec)) if (e.accountId === acc.id) cleared += e.amount;
      }
      const difference = statement - cleared;
      const rec = await tx.reconciliation.create({
        data: {
          userId: user.id,
          accountId: acc.id,
          statementDate: d.statementDate,
          statementBalance: big(statement),
          clearedBalance: big(cleared),
          difference: big(difference),
        },
      });
      await tx.transaction.updateMany({
        where: { id: { in: [...clearedSet] }, userId: user.id },
        data: { cleared: true, reconciliationId: rec.id },
      });
      if (difference !== 0 && d.createAdjustment) {
        const adj = await tx.transaction.create({
          data: {
            userId: user.id,
            type: "ADJUSTMENT",
            amount: big(difference),
            currency: acc.currency,
            date: d.statementDate,
            accountId: acc.id,
            description: "Reconciliation adjustment",
            cleared: true,
            reconciliationId: rec.id,
          },
        });
        await tx.reconciliation.update({ where: { id: rec.id }, data: { adjustmentTxId: adj.id } });
      }
      await audit(user.id, "account.reconcile", "Account", acc.id, { difference });
      revalidateAll();
      return ok(
        difference === 0
          ? "Reconciled — balances match"
          : d.createAdjustment
            ? "Reconciled with an adjustment for the difference"
            : "Saved — a difference remains to investigate",
      );
    });
  });
}
