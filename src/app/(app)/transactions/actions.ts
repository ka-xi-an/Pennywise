"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { createTransaction, deleteTransactions, inputFromRecord, updateTransaction, type TxInput } from "@/lib/server/services/transactions";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { TX_TYPES, PAYMENT_METHODS } from "@/lib/finance/types";
import { decimalStr, isoDate, money, optId, optMoney, optStr } from "@/lib/validation";
import { todayIn } from "@/lib/finance/dates";
import { getPrefs } from "@/lib/server/data";

const txSchema = z
  .object({
    id: optId,
    type: z.enum(TX_TYPES, { message: "Choose a transaction type" }),
    amount: z.string().trim().min(1, "Amount is required"),
    date: isoDate(),
    accountId: z.string().trim().min(1, "Choose an account"),
    toAccountId: optId,
    toAmount: optMoney("Amount received"),
    categoryId: optId,
    merchant: optStr(120),
    paymentMethod: z
      .string()
      .optional()
      .transform((v) => (v && (PAYMENT_METHODS as readonly string[]).includes(v) ? v : null)),
    description: optStr(300),
    notes: optStr(2000),
    tags: optStr(300),
    principalAmount: optMoney("Principal"),
    interestAmount: optMoney("Interest"),
    loanId: optId,
    refundOfId: optId,
    holdingId: optId,
    quantity: decimalStr("Quantity", { optional: true, min: 0 }),
    price: decimalStr("Price", { optional: true, min: 0 }),
    fees: optMoney("Fees"),
  })
  .transform((v, ctx) => {
    const amt = money("Amount", { allowNegative: v.type === "ADJUSTMENT" }).safeParse(v.amount);
    const unitsGiven = !!(v.quantity && v.price);
    if (!amt.success) {
      if (!((v.type === "INVESTMENT_BUY" || v.type === "INVESTMENT_SELL") && unitsGiven)) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: amt.error.issues[0]?.message ?? "Invalid amount" });
        return z.NEVER;
      }
    }
    return { ...v, amountMinor: amt.success ? amt.data : 0 };
  });

function toInput(d: z.infer<typeof txSchema>): TxInput {
  return {
    type: d.type,
    amount: d.amountMinor,
    date: d.date,
    accountId: d.accountId,
    toAccountId: d.toAccountId,
    toAmount: d.toAmount,
    categoryId: d.categoryId,
    merchant: d.merchant,
    paymentMethod: d.paymentMethod,
    description: d.description,
    notes: d.notes,
    tags: d.tags ? d.tags.split(",") : [],
    principalAmount: d.principalAmount,
    interestAmount: d.interestAmount,
    loanId: d.loanId,
    refundOfId: d.refundOfId,
    holdingId: d.holdingId,
    quantity: d.quantity,
    price: d.price,
    fees: d.fees ?? 0,
  };
}

export async function saveTransaction(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(txSchema, fd);
    if (p.error) return p.error;
    const input = toInput(p.data);
    if (p.data.id) {
      const t = await updateTransaction(user.id, p.data.id, input);
      await audit(user.id, "transaction.update", "Transaction", t.id, { type: input.type, amount: input.amount });
      revalidateAll();
      return ok("Transaction updated");
    }
    const t = await createTransaction(user.id, input);
    await audit(user.id, "transaction.create", "Transaction", t.id, { type: input.type, amount: input.amount });
    revalidateAll();
    return ok("Transaction saved", { id: t.id });
  });
}

export async function deleteTransaction(id: string) {
  const user = await requireUser();
  return run(async () => {
    const count = await deleteTransactions(user.id, [id]);
    if (!count) return fail("Transaction not found");
    await audit(user.id, "transaction.delete", "Transaction", id);
    revalidateAll();
    return ok("Transaction deleted");
  });
}

export async function duplicateTransaction(id: string) {
  const user = await requireUser();
  return run(async () => {
    const t = await db.transaction.findFirst({ where: { id, userId: user.id }, include: { tags: { include: { tag: true } }, investmentTxn: true } });
    if (!t) return fail("Transaction not found");
    const prefs = await getPrefs(user.id);
    const input = { ...inputFromRecord(t), date: todayIn(prefs.timezone), refundOfId: null };
    const created = await createTransaction(user.id, input);
    await audit(user.id, "transaction.duplicate", "Transaction", created.id, { from: id });
    revalidateAll();
    return ok("Duplicated with today's date");
  });
}

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Select at least one transaction").max(5000),
  op: z.enum(["delete", "category", "tag", "paymentMethod", "date"]),
  value: z.string().optional(),
});

export async function bulkTransactions(input: { ids: string[]; op: string; value?: string }) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(bulkSchema, input);
    if (p.error) return p.error;
    const { ids, op, value } = p.data;
    const own = await db.transaction.findMany({ where: { id: { in: ids }, userId: user.id }, select: { id: true, type: true } });
    const ownIds = own.map((t) => t.id);
    if (op === "delete") {
      const c = await deleteTransactions(user.id, ownIds);
      await audit(user.id, "transaction.bulk_delete", "Transaction", null, { count: c });
      revalidateAll();
      return ok(`Deleted ${c} transaction${c === 1 ? "" : "s"}`);
    }
    if (op === "category") {
      const cat = value ? await db.category.findFirst({ where: { id: value, userId: user.id } }) : null;
      if (value && !cat) return fail("Category not found");
      const allowed = own.filter((t) =>
        !cat
          ? ["INCOME", "EXPENSE", "REFUND", "DIVIDEND", "INTEREST"].includes(t.type)
          : cat.kind === "INCOME"
            ? ["INCOME", "DIVIDEND", "INTEREST"].includes(t.type)
            : ["EXPENSE", "REFUND", "LOAN_REPAYMENT"].includes(t.type),
      );
      await db.transaction.updateMany({ where: { id: { in: allowed.map((t) => t.id) }, userId: user.id }, data: { categoryId: cat?.id ?? null } });
      const skipped = own.length - allowed.length;
      await audit(user.id, "transaction.bulk_categorize", "Transaction", null, { count: allowed.length, categoryId: value });
      revalidateAll();
      return ok(`Categorised ${allowed.length}${skipped ? ` · ${skipped} skipped (category type doesn't match transaction type)` : ""}`);
    }
    if (op === "tag") {
      const name = (value ?? "").trim().toLowerCase();
      if (!name) return fail("Enter a tag");
      const tag = await db.tag.upsert({ where: { userId_name: { userId: user.id, name } }, create: { userId: user.id, name }, update: {} });
      for (const id of ownIds) {
        await db.transactionTag.upsert({ where: { transactionId_tagId: { transactionId: id, tagId: tag.id } }, create: { transactionId: id, tagId: tag.id }, update: {} });
      }
      revalidateAll();
      return ok(`Tagged ${ownIds.length} transaction${ownIds.length === 1 ? "" : "s"} “${name}”`);
    }
    if (op === "paymentMethod") {
      if (!value || !(PAYMENT_METHODS as readonly string[]).includes(value)) return fail("Choose a payment method");
      await db.transaction.updateMany({ where: { id: { in: ownIds }, userId: user.id }, data: { paymentMethod: value } });
      revalidateAll();
      return ok(`Updated ${ownIds.length} transaction${ownIds.length === 1 ? "" : "s"}`);
    }
    return fail("Unsupported bulk operation");
  });
}

const templateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(60),
  type: z.enum(TX_TYPES),
  amount: optMoney("Amount"),
  accountId: optId,
  toAccountId: optId,
  categoryId: optId,
  merchant: optStr(120),
  paymentMethod: optStr(40),
  description: optStr(300),
});

export async function saveTemplate(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(templateSchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    if (d.accountId && !(await db.account.findFirst({ where: { id: d.accountId, userId: user.id } }))) return fail("Account not found");
    await db.transactionTemplate.create({ data: { ...d, amount: big(d.amount), userId: user.id } });
    revalidateAll();
    return ok("Template saved");
  });
}

export async function deleteTemplate(id: string) {
  const user = await requireUser();
  return run(async () => {
    await db.transactionTemplate.deleteMany({ where: { id, userId: user.id } });
    revalidateAll();
    return ok("Template deleted");
  });
}
