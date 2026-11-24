"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { checkbox, intStr, isoDate, money, optDate, optId, optStr } from "@/lib/validation";
import { FREQUENCIES } from "@/lib/finance/recurring";
import { createTransactionTx, ValidationError } from "@/lib/server/services/transactions";
import type { TxType } from "@/lib/finance/types";

const RULE_TX_TYPES = ["EXPENSE", "INCOME", "TRANSFER", "LOAN_REPAYMENT"] as const;
const KINDS = ["BILL", "SUBSCRIPTION", "INCOME", "EMI", "TRANSFER", "INVESTMENT", "OTHER"] as const;

const ruleSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Name is required").max(80),
  kind: z.enum(KINDS),
  billType: optStr(30),
  txType: z.enum(RULE_TX_TYPES),
  amount: money("Amount", { positive: true }),
  accountId: z.string().min(1, "Choose an account"),
  toAccountId: optId,
  categoryId: optId,
  merchant: optStr(120),
  paymentMethod: optStr(30),
  frequency: z.enum(FREQUENCIES),
  interval: intStr("Interval", 1, 12),
  startDate: isoDate("First due date"),
  endDate: optDate("End date"),
  autoPost: checkbox,
  reminderDays: intStr("Reminder days", 0, 30),
  loanId: optId,
  notes: optStr(500),
});

export async function saveRule(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(ruleSchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    const acc = await db.account.findFirst({ where: { id: d.accountId, userId: user.id } });
    if (!acc) return fail("Account not found", { accountId: "Not found" });
    if (d.txType === "TRANSFER" && (!d.toAccountId || d.toAccountId === d.accountId))
      return fail("Choose a different destination account", { toAccountId: "Required" });
    if (d.toAccountId && !(await db.account.findFirst({ where: { id: d.toAccountId, userId: user.id } }))) return fail("Destination not found");
    if (d.categoryId) {
      const c = await db.category.findFirst({ where: { id: d.categoryId, userId: user.id } });
      if (!c) return fail("Category not found");
      if ((d.txType === "INCOME") !== (c.kind === "INCOME")) return fail("Category type doesn't match", { categoryId: "Mismatch" });
    }
    if (d.loanId && !(await db.loan.findFirst({ where: { id: d.loanId, userId: user.id } }))) return fail("Loan not found");
    if (d.endDate && d.endDate < d.startDate) return fail("End date must be after the first due date", { endDate: "Invalid" });
    const data = {
      ...d,
      id: undefined,
      amount: big(d.amount),
      currency: acc.currency,
      toAccountId: d.txType === "TRANSFER" ? d.toAccountId : d.txType === "LOAN_REPAYMENT" ? d.toAccountId : null,
    };
    if (d.id) {
      const r = await db.recurringRule.updateMany({ where: { id: d.id, userId: user.id }, data });
      if (!r.count) return fail("Schedule not found");
      revalidateAll();
      return ok("Schedule updated");
    }
    const rule = await db.recurringRule.create({ data: { ...data, userId: user.id } });
    await audit(user.id, "recurring.create", "RecurringRule", rule.id);
    revalidateAll();
    return ok(d.autoPost ? "Schedule created — due items will post automatically" : "Schedule created");
  });
}

export async function toggleRule(id: string, active: boolean) {
  const user = await requireUser();
  await db.recurringRule.updateMany({ where: { id, userId: user.id }, data: { active } });
  revalidateAll();
  return ok(active ? "Schedule resumed" : "Schedule paused");
}

export async function deleteRule(id: string) {
  const user = await requireUser();
  return run(async () => {
    const r = await db.recurringRule.deleteMany({ where: { id, userId: user.id } });
    if (!r.count) return fail("Schedule not found");
    await audit(user.id, "recurring.delete", "RecurringRule", id);
    revalidateAll();
    return ok("Schedule deleted — posted transactions were kept");
  });
}

const paySchema = z.object({
  ruleId: z.string().min(1),
  dueDate: isoDate(),
  paidDate: isoDate("Paid on"),
  amount: money("Amount", { positive: true }),
  accountId: z.string().min(1, "Choose an account"),
});

/** Mark a bill occurrence paid: posts the ledger transaction and records the occurrence atomically. */
export async function markOccurrencePaid(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(paySchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    const rule = await db.recurringRule.findFirst({ where: { id: d.ruleId, userId: user.id } });
    if (!rule) return fail("Schedule not found");
    await db.$transaction(async (tx) => {
      const exists = await tx.recurringOccurrence.findUnique({ where: { ruleId_dueDate: { ruleId: rule.id, dueDate: d.dueDate } } });
      if (exists) throw new Error("ALREADY");
      const t = await createTransactionTx(tx, user.id, {
        type: rule.txType as TxType,
        amount: d.amount,
        date: d.paidDate,
        accountId: d.accountId,
        toAccountId: rule.toAccountId,
        toAmount: null,
        categoryId: rule.categoryId,
        merchant: rule.merchant,
        paymentMethod: rule.paymentMethod,
        description: rule.name,
        notes: `Payment for ${d.dueDate}`,
        tags: [],
        principalAmount: null,
        interestAmount: null,
        loanId: rule.loanId,
        refundOfId: null,
        holdingId: null,
        quantity: null,
        price: null,
        fees: 0,
        recurringRuleId: rule.id,
        isDemo: rule.isDemo,
      });
      await tx.recurringOccurrence.create({ data: { ruleId: rule.id, dueDate: d.dueDate, status: "PAID", transactionId: t.id, paidDate: d.paidDate } });
    }).catch((e) => {
      if (e instanceof Error && e.message === "ALREADY") throw new ValidationError("This occurrence is already recorded");
      throw e;
    });
    await audit(user.id, "recurring.paid", "RecurringRule", rule.id, { dueDate: d.dueDate });
    revalidateAll();
    return ok(`${rule.name} marked paid`);
  });
}

export async function skipOccurrence(ruleId: string, dueDate: string) {
  const user = await requireUser();
  return run(async () => {
    const rule = await db.recurringRule.findFirst({ where: { id: ruleId, userId: user.id } });
    if (!rule) return fail("Schedule not found");
    await db.recurringOccurrence.upsert({
      where: { ruleId_dueDate: { ruleId, dueDate } },
      create: { ruleId, dueDate, status: "SKIPPED" },
      update: {},
    });
    revalidateAll();
    return ok("Occurrence skipped");
  });
}

/** Undo: removes the occurrence record and (for paid ones) the transaction it created. */
export async function undoOccurrence(ruleId: string, dueDate: string) {
  const user = await requireUser();
  return run(async () => {
    const rule = await db.recurringRule.findFirst({ where: { id: ruleId, userId: user.id } });
    if (!rule) return fail("Schedule not found");
    const occ = await db.recurringOccurrence.findUnique({ where: { ruleId_dueDate: { ruleId, dueDate } } });
    if (!occ) return fail("Nothing to undo");
    await db.$transaction(async (tx) => {
      await tx.recurringOccurrence.delete({ where: { id: occ.id } });
      if (occ.transactionId) await tx.transaction.deleteMany({ where: { id: occ.transactionId, userId: user.id } });
    });
    revalidateAll();
    return ok("Reverted");
  });
}

export async function createSubscriptionFromCandidate(input: { merchant: string; amount: number; accountId: string; categoryId: string | null; lastDate: string; yearly: boolean }) {
  const user = await requireUser();
  return run(async () => {
    const acc = await db.account.findFirst({ where: { id: input.accountId, userId: user.id } });
    if (!acc) return fail("Account not found");
    const start = input.lastDate;
    await db.recurringRule.create({
      data: {
        userId: user.id,
        name: input.merchant,
        kind: "SUBSCRIPTION",
        billType: "OTHER",
        txType: "EXPENSE",
        amount: big(input.amount),
        currency: acc.currency,
        accountId: acc.id,
        categoryId: input.categoryId,
        merchant: input.merchant,
        frequency: input.yearly ? "YEARLY" : "MONTHLY",
        startDate: start,
        autoPost: false,
        reminderDays: 3,
        notes: "Created from detected recurring charges",
      },
    });
    // Past charges are already in the ledger — mark the last one as the paid occurrence.
    const rule = await db.recurringRule.findFirst({ where: { userId: user.id, name: input.merchant }, orderBy: { createdAt: "desc" } });
    if (rule) {
      const lastTx = await db.transaction.findFirst({ where: { userId: user.id, merchant: input.merchant, date: start, type: "EXPENSE" } });
      await db.recurringOccurrence.create({ data: { ruleId: rule.id, dueDate: start, status: "PAID", transactionId: lastTx?.id ?? null, paidDate: start } });
    }
    revalidateAll();
    return ok(`Tracking ${input.merchant} as a subscription`);
  });
}
