import "server-only";
import type { Prisma } from "@prisma/client";
import { db, big, n } from "../db";
import { splitPayment } from "@/lib/finance/loans";
import type { TxType } from "@/lib/finance/types";
import { recordInvestmentTx, ValidationError } from "./investments";

export { ValidationError };

export interface TxInput {
  type: TxType;
  amount: number; // minor units (signed only for ADJUSTMENT)
  date: string;
  accountId: string;
  toAccountId: string | null;
  toAmount: number | null;
  categoryId: string | null;
  merchant: string | null;
  paymentMethod: string | null;
  description: string | null;
  notes: string | null;
  tags: string[];
  principalAmount: number | null;
  interestAmount: number | null;
  loanId: string | null;
  refundOfId: string | null;
  holdingId: string | null;
  quantity: string | null;
  price: string | null;
  fees: number;
  recurringRuleId?: string | null;
  importBatchId?: string | null;
  isDemo?: boolean;
}

const INCOME_TYPES: TxType[] = ["INCOME", "DIVIDEND", "INTEREST"];
const EXPENSE_CAT_TYPES: TxType[] = ["EXPENSE", "REFUND", "LOAN_REPAYMENT"];

/**
 * Validates an input against the user's data and builds the Prisma create payload.
 * Every rule that protects ledger integrity lives here.
 */
async function prepare(tx: Prisma.TransactionClient, userId: string, i: TxInput, editingId?: string) {
  const account = await tx.account.findFirst({ where: { id: i.accountId, userId } });
  if (!account) throw new ValidationError("Choose an account", "accountId");
  if (account.status === "CLOSED") throw new ValidationError("This account is closed — reopen it to post transactions", "accountId");
  if (i.date < "1900-01-01" || i.date > "2100-12-31") throw new ValidationError("Date is out of range", "date");

  const unitsPriced = (i.type === "INVESTMENT_BUY" || i.type === "INVESTMENT_SELL") && !!i.quantity && !!i.price;
  if (i.type === "ADJUSTMENT") {
    if (i.amount === 0) throw new ValidationError("Adjustment cannot be zero", "amount");
  } else if (i.amount <= 0 && !unitsPriced) throw new ValidationError("Amount must be greater than zero", "amount");

  const data: Prisma.TransactionUncheckedCreateInput = {
    userId,
    type: i.type,
    amount: big(Math.max(i.amount, unitsPriced ? 1 : i.amount)),
    currency: account.currency,
    date: i.date,
    accountId: account.id,
    toAccountId: null,
    toAmount: null,
    categoryId: null,
    merchant: i.merchant,
    paymentMethod: i.paymentMethod,
    description: i.description,
    notes: i.notes,
    principalAmount: null,
    interestAmount: null,
    loanId: null,
    refundOfId: null,
    recurringRuleId: i.recurringRuleId ?? null,
    importBatchId: i.importBatchId ?? null,
    isDemo: i.isDemo ?? false,
  };

  // Category must exist, belong to the user and match the transaction direction.
  if (i.categoryId) {
    const cat = await tx.category.findFirst({ where: { id: i.categoryId, userId } });
    if (!cat) throw new ValidationError("Category not found", "categoryId");
    if (INCOME_TYPES.includes(i.type) && cat.kind !== "INCOME")
      throw new ValidationError("Choose an income category for this type", "categoryId");
    if (EXPENSE_CAT_TYPES.includes(i.type) && cat.kind !== "EXPENSE")
      throw new ValidationError("Choose an expense category for this type", "categoryId");
    if (["TRANSFER", "LOAN_DISBURSEMENT", "ADJUSTMENT", "INVESTMENT_BUY", "INVESTMENT_SELL"].includes(i.type))
      data.categoryId = null; // these never carry a spending/income category
    else data.categoryId = cat.id;
  }

  switch (i.type) {
    case "TRANSFER":
    case "LOAN_DISBURSEMENT": {
      if (!i.toAccountId) throw new ValidationError("Choose the destination account", "toAccountId");
      if (i.toAccountId === account.id) throw new ValidationError("Source and destination must differ", "toAccountId");
      const to = await tx.account.findFirst({ where: { id: i.toAccountId, userId } });
      if (!to) throw new ValidationError("Destination account not found", "toAccountId");
      if (to.status === "CLOSED") throw new ValidationError("Destination account is closed", "toAccountId");
      if (i.type === "LOAN_DISBURSEMENT" && account.type !== "LOAN")
        throw new ValidationError("A disbursement must come from a loan account", "accountId");
      data.toAccountId = to.id;
      if (to.currency !== account.currency) {
        if (!i.toAmount || i.toAmount <= 0)
          throw new ValidationError(`Enter the amount received in ${to.currency}`, "toAmount");
        data.toAmount = big(i.toAmount);
      }
      break;
    }
    case "LOAN_REPAYMENT": {
      let loanAccountId = i.toAccountId;
      if (i.loanId) {
        const loan = await tx.loan.findFirst({ where: { id: i.loanId, userId } });
        if (!loan) throw new ValidationError("Loan not found", "loanId");
        data.loanId = loan.id;
        loanAccountId = loan.accountId;
      }
      let principal = i.principalAmount;
      let interest = i.interestAmount;
      if (loanAccountId) {
        const la = await tx.account.findFirst({ where: { id: loanAccountId, userId } });
        if (!la || la.type !== "LOAN") throw new ValidationError("Choose a loan account", "toAccountId");
        if (la.id === account.id) throw new ValidationError("Pay the loan from a bank or cash account", "accountId");
        data.toAccountId = la.id;
        if (principal == null && interest == null && data.loanId) {
          // Auto-split using the loan's rate and the outstanding principal before this payment.
          const loan = await tx.loan.findUnique({ where: { id: data.loanId as string } });
          const outstanding = await outstandingBefore(tx, la.id, i.date, editingId);
          const s = splitPayment(outstanding, Number(loan!.interestRate), i.amount);
          principal = s.principal + s.excess;
          interest = s.interest;
        }
      }
      interest ??= principal != null ? i.amount - principal : 0;
      principal ??= i.amount - interest;
      if (principal < 0 || interest < 0) throw new ValidationError("Principal and interest cannot be negative", "principalAmount");
      if (principal + interest !== i.amount)
        throw new ValidationError("Principal + interest must equal the payment amount", "principalAmount");
      data.principalAmount = big(principal);
      data.interestAmount = big(interest);
      if (!data.categoryId && interest > 0) {
        data.categoryId = (await tx.category.findFirst({ where: { userId, name: "Loan interest" }, select: { id: true } }))?.id ?? null;
      }
      break;
    }
    case "REFUND": {
      if (i.refundOfId) {
        const orig = await tx.transaction.findFirst({ where: { id: i.refundOfId, userId }, include: { refunds: true } });
        if (!orig || orig.type !== "EXPENSE") throw new ValidationError("A refund must reference an expense", "refundOfId");
        const already = orig.refunds.filter((r) => r.id !== editingId).reduce((s, r) => s + n(r.amount), 0);
        if (already + i.amount > n(orig.amount))
          throw new ValidationError("Refunds cannot exceed the original expense", "amount");
        data.refundOfId = orig.id;
        data.categoryId ??= orig.categoryId;
        data.merchant ??= orig.merchant;
      }
      break;
    }
    case "INVESTMENT_BUY":
    case "INVESTMENT_SELL":
      if (account.type === "LOAN") throw new ValidationError("Choose a bank, cash or brokerage account", "accountId");
      if (!i.holdingId) throw new ValidationError("Choose the holding", "holdingId");
      break;
  }
  return data;
}

async function outstandingBefore(tx: Prisma.TransactionClient, loanAccountId: string, date: string, excludeId?: string) {
  const acc = await tx.account.findUnique({ where: { id: loanAccountId } });
  const txs = await tx.transaction.findMany({
    where: { OR: [{ accountId: loanAccountId }, { toAccountId: loanAccountId }], date: { lte: date }, id: excludeId ? { not: excludeId } : undefined },
  });
  let bal = acc && acc.openingDate <= date ? n(acc.openingBalance) : 0;
  for (const t of txs) {
    const amt = n(t.amount);
    if (t.accountId === loanAccountId) bal -= amt;
    if (t.toAccountId === loanAccountId) bal += t.type === "LOAN_REPAYMENT" ? n(t.principalAmount ?? t.amount) : n(t.toAmount ?? t.amount);
  }
  return Math.max(0, -bal);
}

async function setTags(tx: Prisma.TransactionClient, userId: string, transactionId: string, tags: string[]) {
  await tx.transactionTag.deleteMany({ where: { transactionId } });
  const names = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  for (const name of names) {
    const tag = await tx.tag.upsert({ where: { userId_name: { userId, name } }, create: { userId, name }, update: {} });
    await tx.transactionTag.create({ data: { transactionId, tagId: tag.id } });
  }
}

export async function createTransactionTx(tx: Prisma.TransactionClient, userId: string, i: TxInput) {
  if (i.type === "INVESTMENT_BUY" || i.type === "INVESTMENT_SELL" || (i.holdingId && (i.type === "DIVIDEND" || i.type === "INTEREST"))) {
    const checked = await prepare(tx, userId, i); // account / category / generic validation
    const inv = await recordInvestmentTx(tx, userId, {
      holdingId: i.holdingId!,
      type: i.type === "INVESTMENT_BUY" ? "BUY" : i.type === "INVESTMENT_SELL" ? "SELL" : i.type,
      date: i.date,
      quantity: i.quantity,
      price: i.price,
      amount: i.quantity && i.price ? null : i.amount,
      fees: i.fees,
      ratio: null,
      cashAccountId: i.accountId,
      notes: i.notes,
      isDemo: i.isDemo,
    });
    const id = inv.cashTransactionId!;
    await tx.transaction.update({
      where: { id },
      data: {
        notes: i.notes,
        description: i.description ?? undefined,
        paymentMethod: i.paymentMethod ?? undefined,
        categoryId: checked.categoryId ?? undefined,
        importBatchId: i.importBatchId ?? null,
      },
    });
    await setTags(tx, userId, id, i.tags);
    return tx.transaction.findUniqueOrThrow({ where: { id } });
  }
  const data = await prepare(tx, userId, i);
  const created = await tx.transaction.create({ data });
  await setTags(tx, userId, created.id, i.tags);
  return created;
}

export async function createTransaction(userId: string, i: TxInput) {
  return db.$transaction((tx) => createTransactionTx(tx, userId, i));
}

export async function updateTransaction(userId: string, id: string, i: TxInput) {
  return db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId }, include: { investmentTxn: true } });
    if (!existing) throw new ValidationError("Transaction not found");
    if (existing.investmentTxn || i.type === "INVESTMENT_BUY" || i.type === "INVESTMENT_SELL") {
      // Investment-linked rows are rebuilt so the holding and the cash leg stay consistent.
      if (existing.investmentTxn) await tx.investmentTransaction.delete({ where: { id: existing.investmentTxn.id } });
      const attachments = await tx.attachment.findMany({ where: { transactionId: id } });
      await tx.transaction.delete({ where: { id } });
      const created = await createTransactionTx(tx, userId, { ...i, isDemo: existing.isDemo });
      for (const a of attachments) await tx.attachment.create({ data: { ...a, id: undefined, transactionId: created.id } });
      return created;
    }
    const data = await prepare(tx, userId, i, id);
    const { userId: _u, ...rest } = data;
    const updated = await tx.transaction.update({ where: { id }, data: { ...rest, isDemo: existing.isDemo } });
    await setTags(tx, userId, id, i.tags);
    return updated;
  });
}

export async function deleteTransactions(userId: string, ids: string[]) {
  return db.$transaction(async (tx) => {
    const rows = await tx.transaction.findMany({ where: { id: { in: ids }, userId }, select: { id: true } });
    const own = rows.map((r) => r.id);
    // Linked investment legs and paid bill occurrences are removed with the cash movement.
    await tx.investmentTransaction.deleteMany({ where: { cashTransactionId: { in: own }, userId } });
    await tx.recurringOccurrence.deleteMany({ where: { transactionId: { in: own } } });
    await tx.transaction.deleteMany({ where: { id: { in: own }, userId } });
    return own.length;
  });
}

export function inputFromRecord(t: Prisma.TransactionGetPayload<{ include: { tags: { include: { tag: true } }; investmentTxn: true } }>): TxInput {
  return {
    type: t.type as TxType,
    amount: n(t.amount),
    date: t.date,
    accountId: t.accountId,
    toAccountId: t.toAccountId,
    toAmount: n(t.toAmount),
    categoryId: t.categoryId,
    merchant: t.merchant,
    paymentMethod: t.paymentMethod,
    description: t.description,
    notes: t.notes,
    tags: t.tags.map((x) => x.tag.name),
    principalAmount: n(t.principalAmount),
    interestAmount: n(t.interestAmount),
    loanId: t.loanId,
    refundOfId: t.refundOfId,
    holdingId: t.investmentTxn?.holdingId ?? null,
    quantity: t.investmentTxn?.quantity ?? null,
    price: t.investmentTxn?.price ?? null,
    fees: n(t.investmentTxn?.fees ?? BigInt(0)),
  };
}
