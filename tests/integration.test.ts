/**
 * Integration tests: real services + Prisma against an isolated SQLite database.
 * Covers ledger integrity, investment linkage, refunds, loans, recurring idempotency,
 * cross-user isolation, demo data consistency and removal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { createDefaultCategories } from "@/lib/server/defaults";
import { createTransaction, deleteTransactions, updateTransaction, type TxInput } from "@/lib/server/services/transactions";
import { recordInvestmentTx, deleteInvestmentTx } from "@/lib/server/services/investments";
import { autoPostRecurring } from "@/lib/server/services/recurring";
import { loadDemoData, removeDemoData } from "@/lib/server/services/demo";
import { getCtx } from "@/lib/server/data";
import { accountBalances, cashFlowStatement, summarize } from "@/lib/finance/ledger";
import { todayIn } from "@/lib/finance/dates";
import { importTransactions } from "@/lib/server/services/importer";

const R = (x: number) => Math.round(x * 100);
const base: Omit<TxInput, "type" | "amount" | "accountId"> = {
  date: "2025-06-10",
  toAccountId: null,
  toAmount: null,
  categoryId: null,
  merchant: null,
  paymentMethod: null,
  description: null,
  notes: null,
  tags: [],
  principalAmount: null,
  interestAmount: null,
  loanId: null,
  refundOfId: null,
  holdingId: null,
  quantity: null,
  price: null,
  fees: 0,
};

async function mkUser(email: string) {
  const u = await db.user.create({ data: { email, name: email, passwordHash: "x" } });
  await db.userPreference.create({ data: { userId: u.id, onboarded: true } });
  await db.$transaction((tx) => createDefaultCategories(tx, u.id));
  return u;
}
async function balances(userId: string) {
  const accounts = await db.account.findMany({ where: { userId } });
  const txs = await db.transaction.findMany({ where: { userId } });
  return accountBalances(
    accounts.map((a) => ({ ...a, openingBalance: Number(a.openingBalance), creditLimit: null, type: a.type as never, status: a.status as never })),
    txs.map((t) => ({
      ...t,
      type: t.type as never,
      amount: Number(t.amount),
      toAmount: t.toAmount == null ? null : Number(t.toAmount),
      principalAmount: t.principalAmount == null ? null : Number(t.principalAmount),
      interestAmount: t.interestAmount == null ? null : Number(t.interestAmount),
    })),
  );
}

let A: { id: string };
let B: { id: string };
let bank: { id: string }, wallet: { id: string }, card: { id: string }, usd: { id: string };

beforeAll(async () => {
  A = await mkUser("a@test.local");
  B = await mkUser("b@test.local");
  bank = await db.account.create({ data: { userId: A.id, name: "Bank", type: "SAVINGS", currency: "INR", openingBalance: BigInt(R(10000)), openingDate: "2025-01-01" } });
  wallet = await db.account.create({ data: { userId: A.id, name: "Wallet", type: "WALLET", currency: "INR", openingBalance: BigInt(0), openingDate: "2025-01-01" } });
  card = await db.account.create({ data: { userId: A.id, name: "Card", type: "CREDIT_CARD", currency: "INR", openingBalance: BigInt(0), openingDate: "2025-01-01" } });
  usd = await db.account.create({ data: { userId: A.id, name: "USD", type: "FOREIGN_CURRENCY", currency: "USD", openingBalance: BigInt(0), openingDate: "2025-01-01" } });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("ledger workflows", () => {
  it("records income, expenses and transfers with correct balances", async () => {
    const salary = await db.category.findFirst({ where: { userId: A.id, name: "Salary" } });
    const groceries = await db.category.findFirst({ where: { userId: A.id, name: "Groceries" } });
    await createTransaction(A.id, { ...base, type: "INCOME", amount: R(50000), accountId: bank.id, categoryId: salary!.id });
    const exp = await createTransaction(A.id, { ...base, type: "EXPENSE", amount: R(1200), accountId: wallet.id, categoryId: groceries!.id, tags: ["Weekly", "weekly"] });
    await createTransaction(A.id, { ...base, type: "TRANSFER", amount: R(5000), accountId: bank.id, toAccountId: wallet.id });
    const b = await balances(A.id);
    expect(b.get(bank.id)).toBe(R(10000 + 50000 - 5000));
    expect(b.get(wallet.id)).toBe(R(5000 - 1200));
    const tags = await db.transactionTag.count({ where: { transactionId: exp.id } });
    expect(tags).toBe(1); // de-duplicated, case-insensitive
  });

  it("rejects invalid integrity cases", async () => {
    const salary = await db.category.findFirst({ where: { userId: A.id, name: "Salary" } });
    await expect(createTransaction(A.id, { ...base, type: "TRANSFER", amount: R(1), accountId: bank.id, toAccountId: bank.id })).rejects.toThrow(/differ/);
    await expect(createTransaction(A.id, { ...base, type: "EXPENSE", amount: R(1), accountId: bank.id, categoryId: salary!.id })).rejects.toThrow(/expense category/);
    await expect(createTransaction(A.id, { ...base, type: "EXPENSE", amount: 0, accountId: bank.id })).rejects.toThrow(/greater than zero/);
    await expect(createTransaction(A.id, { ...base, type: "TRANSFER", amount: R(10), accountId: bank.id, toAccountId: usd.id })).rejects.toThrow(/USD/);
  });

  it("handles cross-currency transfers with an explicit received amount", async () => {
    await createTransaction(A.id, { ...base, type: "TRANSFER", amount: R(8325), accountId: bank.id, toAccountId: usd.id, toAmount: 10000 });
    const b = await balances(A.id);
    expect(b.get(usd.id)).toBe(10000); // $100.00
  });

  it("caps refunds at the original expense and nets them in the category", async () => {
    const shop = await db.category.findFirst({ where: { userId: A.id, name: "Clothing" } });
    const e = await createTransaction(A.id, { ...base, type: "EXPENSE", amount: R(3000), accountId: card.id, categoryId: shop!.id });
    await createTransaction(A.id, { ...base, type: "REFUND", amount: R(1000), accountId: card.id, refundOfId: e.id });
    await expect(createTransaction(A.id, { ...base, type: "REFUND", amount: R(2500), accountId: card.id, refundOfId: e.id })).rejects.toThrow(/exceed/);
    const ctx = await getCtx(A.id);
    const s = summarize(ctx.txs, { from: "2025-06-01", to: "2025-06-30" });
    expect(s.expenses).toBe(R(1200 + 3000 - 1000));
    expect(s.income).toBe(R(50000));
  });

  it("splits loan repayments automatically using the loan rate", async () => {
    const loanAcc = await db.account.create({ data: { userId: A.id, name: "Loan", type: "LOAN", currency: "INR", openingBalance: BigInt(-R(120000)), openingDate: "2025-01-01" } });
    const loan = await db.loan.create({ data: { userId: A.id, accountId: loanAcc.id, name: "Loan", loanType: "PERSONAL", principal: BigInt(R(120000)), interestRate: "12", tenureMonths: 12, startDate: "2025-01-01", emi: BigInt(R(10661.85)) } });
    const t = await createTransaction(A.id, { ...base, type: "LOAN_REPAYMENT", amount: R(10661.85), accountId: bank.id, loanId: loan.id });
    expect(Number(t.interestAmount)).toBe(R(1200));
    expect(Number(t.principalAmount)).toBe(R(9461.85));
    const b = await balances(A.id);
    expect(b.get(loanAcc.id)).toBe(-R(120000 - 9461.85));
  });

  it("keeps investment purchases out of expenses and deletes both legs together", async () => {
    const h = await db.investmentHolding.create({ data: { userId: A.id, name: "Fund", assetClass: "MUTUAL_FUND", valuationMode: "UNITS", currentPrice: "110", priceDate: "2025-06-30" } });
    const t = await createTransaction(A.id, { ...base, type: "INVESTMENT_BUY", amount: 0, accountId: bank.id, holdingId: h.id, quantity: "10", price: "100", fees: R(5) });
    expect(Number(t.amount)).toBe(R(1005));
    const ctx = await getCtx(A.id);
    // groceries 1200 + clothing 3000 − refund 1000 + loan interest 1200; the ₹1,005 purchase is NOT an expense
    expect(summarize(ctx.txs, { from: "2025-06-01", to: "2025-06-30" }).expenses).toBe(R(4400));
    // Over-selling is refused
    await expect(
      db.$transaction((tx) => recordInvestmentTx(tx, A.id, { holdingId: h.id, type: "SELL", date: "2025-06-20", quantity: "11", price: "120", amount: null, fees: 0, ratio: null, cashAccountId: bank.id, notes: null })),
    ).rejects.toThrow(/Only 10/);
    await deleteTransactions(A.id, [t.id]);
    expect(await db.investmentTransaction.count({ where: { holdingId: h.id } })).toBe(0);
    const it2 = await db.$transaction((tx) => recordInvestmentTx(tx, A.id, { holdingId: h.id, type: "BUY", date: "2025-06-20", quantity: "1", price: "100", amount: null, fees: 0, ratio: null, cashAccountId: bank.id, notes: null }));
    await db.$transaction((tx) => deleteInvestmentTx(tx, A.id, it2.id));
    expect(await db.transaction.count({ where: { id: it2.cashTransactionId! } })).toBe(0);
  });

  it("updates propagate to balances", async () => {
    const t = await createTransaction(A.id, { ...base, type: "EXPENSE", amount: R(100), accountId: bank.id });
    const before = (await balances(A.id)).get(bank.id)!;
    await updateTransaction(A.id, t.id, { ...base, type: "EXPENSE", amount: R(250), accountId: bank.id });
    expect((await balances(A.id)).get(bank.id)).toBe(before - R(150));
    await deleteTransactions(A.id, [t.id]);
    expect((await balances(A.id)).get(bank.id)).toBe(before + R(100));
  });
});

describe("authorization & isolation", () => {
  it("prevents a user from posting to another user's account", async () => {
    await expect(createTransaction(B.id, { ...base, type: "EXPENSE", amount: R(10), accountId: bank.id })).rejects.toThrow(/Choose an account/);
  });
  it("prevents deleting another user's transactions", async () => {
    const t = await db.transaction.findFirstOrThrow({ where: { userId: A.id } });
    expect(await deleteTransactions(B.id, [t.id])).toBe(0);
    expect(await db.transaction.count({ where: { id: t.id } })).toBe(1);
  });
  it("loads only the user's own data", async () => {
    const ctxB = await getCtx(B.id);
    expect(ctxB.accounts).toHaveLength(0);
    expect(ctxB.txs).toHaveLength(0);
  });
});

describe("recurring", () => {
  it("auto-posts due occurrences exactly once", async () => {
    const today = "2025-06-20";
    await db.recurringRule.create({
      data: { userId: A.id, name: "Rent", kind: "BILL", txType: "EXPENSE", amount: BigInt(R(20000)), accountId: bank.id, frequency: "MONTHLY", startDate: "2025-05-05", autoPost: true },
    });
    const first = await autoPostRecurring(A.id, today);
    const second = await autoPostRecurring(A.id, today);
    expect(first).toBe(2); // 5 May + 5 Jun
    expect(second).toBe(0);
    expect(await db.transaction.count({ where: { userId: A.id, description: "Rent" } })).toBe(2);
  });
});

describe("CSV import", () => {
  it("validates, flags duplicates and never silently drops rows", async () => {
    const csv = "Date,Description,Amount\n10/06/2025,Coffee,-120.50\n10/06/2025,Coffee,-120.50\n11/06/2025,Refund,99\nbad-date,Oops,10\n12/06/2025,Zero,0\n";
    const res = await importTransactions(A.id, {
      filename: "t.csv",
      accountId: wallet.id,
      text: csv,
      mapping: { date: "Date", description: "Description", amount: "Amount" },
      dayFirst: true,
      amountMode: "signed",
      skipRows: [],
      dryRun: false,
    });
    expect(res.total).toBe(5);
    expect(res.imported).toBe(2); // first coffee + refund-as-income row
    expect(res.duplicates).toBe(1);
    expect(res.errors).toBe(2);
    expect(res.rows.filter((r) => r.status !== "imported")).toHaveLength(3);
    const again = await importTransactions(A.id, { filename: "t.csv", accountId: wallet.id, text: csv, mapping: { date: "Date", description: "Description", amount: "Amount" }, dayFirst: true, amountMode: "signed", skipRows: [], dryRun: true });
    expect(again.rows.filter((r) => r.status === "duplicate").length).toBeGreaterThanOrEqual(2);
  });
});

describe("demo data", () => {
  it("loads consistent fictional data and removes it completely", async () => {
    const C = await mkUser("c@test.local");
    const today = todayIn("Asia/Kolkata");
    const count = await loadDemoData(C.id, today);
    expect(count).toBeGreaterThan(200);
    const ctx = await getCtx(C.id);
    expect(ctx.netWorth.netWorth).toBe(ctx.netWorth.totalAssets - ctx.netWorth.totalLiabilities);
    expect(ctx.accounts.every((a) => a.isDemo)).toBe(true);
    const cf = cashFlowStatement(ctx.accounts, ctx.txs, { from: "2000-01-01", to: today });
    expect(cf.reconciles).toBe(true);
    // Credit card stays a liability (bills paid in arrears), never a large positive asset
    const card = ctx.accounts.find((a) => a.type === "CREDIT_CARD")!;
    expect(ctx.balances.get(card.id)!).toBeLessThanOrEqual(0);
    // No asset account (bank, wallet, cash) is overdrawn in realistic demo data
    for (const a of ctx.accounts.filter((x) => ["SAVINGS", "WALLET", "CASH"].includes(x.type))) expect(ctx.balances.get(a.id)!).toBeGreaterThanOrEqual(0);
    await removeDemoData(C.id);
    expect(await db.transaction.count({ where: { userId: C.id } })).toBe(0);
    expect(await db.account.count({ where: { userId: C.id } })).toBe(0);
    expect(await db.category.count({ where: { userId: C.id } })).toBeGreaterThan(0); // user's categories kept
  });
});
