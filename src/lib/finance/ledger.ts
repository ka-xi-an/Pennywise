/**
 * Ledger semantics — the single source of truth for how every transaction type
 * affects account balances and income/expense figures.
 *
 * Balance effects (money flows from `accountId` to `toAccountId`):
 *   INCOME, DIVIDEND, INTEREST, REFUND, INVESTMENT_SELL   +amount  → accountId
 *   EXPENSE, INVESTMENT_BUY                               −amount  → accountId
 *   TRANSFER, LOAN_DISBURSEMENT                           −amount  → accountId, +(toAmount ?? amount) → toAccountId
 *   LOAN_REPAYMENT                                        −amount  → accountId, +principal → toAccountId (loan)
 *   ADJUSTMENT                                            ±amount  → accountId (signed)
 *
 * Income / expense classification:
 *   income   = INCOME + DIVIDEND + INTEREST
 *   expenses = EXPENSE − REFUND + LOAN_REPAYMENT.interest
 *   Excluded = TRANSFER, INVESTMENT_BUY/SELL (asset swaps), LOAN_DISBURSEMENT,
 *              loan principal (liability reduction) and ADJUSTMENT.
 */
import type { AccountRec, CategoryRec, DateRange, ISODate, Minor, TxRec } from "./types";
import { LIABILITY_ACCOUNT_TYPES } from "./types";
import { addDays, inRange, monthKey, monthsInRange, startOfWeek } from "./dates";
import type { Converter } from "./fx";

export interface Effect {
  accountId: string;
  amount: Minor;
}

export function balanceEffects(tx: TxRec): Effect[] {
  const a = tx.amount;
  switch (tx.type) {
    case "INCOME":
    case "DIVIDEND":
    case "INTEREST":
    case "REFUND":
    case "INVESTMENT_SELL":
      return [{ accountId: tx.accountId, amount: a }];
    case "EXPENSE":
    case "INVESTMENT_BUY":
      return [{ accountId: tx.accountId, amount: -a }];
    case "TRANSFER":
    case "LOAN_DISBURSEMENT": {
      const out: Effect[] = [{ accountId: tx.accountId, amount: -a }];
      if (tx.toAccountId) out.push({ accountId: tx.toAccountId, amount: tx.toAmount ?? a });
      return out;
    }
    case "LOAN_REPAYMENT": {
      const out: Effect[] = [{ accountId: tx.accountId, amount: -a }];
      if (tx.toAccountId) {
        const principal = tx.principalAmount ?? a - (tx.interestAmount ?? 0);
        out.push({ accountId: tx.toAccountId, amount: principal });
      }
      return out;
    }
    case "ADJUSTMENT":
      return [{ accountId: tx.accountId, amount: a }];
    default:
      return [];
  }
}

export function incomeOf(tx: TxRec): Minor {
  return tx.type === "INCOME" || tx.type === "DIVIDEND" || tx.type === "INTEREST" ? tx.amount : 0;
}

export function expenseOf(tx: TxRec): Minor {
  switch (tx.type) {
    case "EXPENSE":
      return tx.amount;
    case "REFUND":
      return -tx.amount;
    case "LOAN_REPAYMENT":
      return tx.interestAmount ?? 0;
    default:
      return 0;
  }
}

export function isIncomeType(tx: TxRec) {
  return incomeOf(tx) !== 0;
}
export function isExpenseType(tx: TxRec) {
  return tx.type === "EXPENSE" || tx.type === "REFUND" || (tx.type === "LOAN_REPAYMENT" && !!tx.interestAmount);
}

/** Account balances in each account's own currency, as of a date (inclusive). */
export function accountBalances(accounts: AccountRec[], txs: TxRec[], asOf?: ISODate): Map<string, Minor> {
  const bal = new Map<string, Minor>();
  for (const a of accounts) bal.set(a.id, !asOf || a.openingDate <= asOf ? a.openingBalance : 0);
  for (const tx of txs) {
    if (asOf && tx.date > asOf) continue;
    for (const e of balanceEffects(tx)) {
      if (bal.has(e.accountId)) bal.set(e.accountId, bal.get(e.accountId)! + e.amount);
    }
  }
  return bal;
}

/** Month-end balance series for one account across a range. */
export function balanceHistory(account: AccountRec, txs: TxRec[], range: DateRange) {
  const months = monthsInRange(range);
  const effects: { date: ISODate; amount: Minor }[] = [];
  for (const tx of txs) {
    for (const e of balanceEffects(tx)) if (e.accountId === account.id) effects.push({ date: tx.date, amount: e.amount });
  }
  effects.sort((a, b) => a.date.localeCompare(b.date));
  const points: { month: string; balance: Minor }[] = [];
  let i = 0;
  let running = 0;
  let openingApplied = false;
  for (const m of months) {
    const monthEnd = m + "-31";
    if (!openingApplied && account.openingDate <= monthEnd) {
      running += account.openingBalance;
      openingApplied = true;
    }
    while (i < effects.length && effects[i].date <= monthEnd) running += effects[i++].amount;
    points.push({ month: m, balance: running });
  }
  return points;
}

/** Daily running balance for an account (used in account detail). */
export function dailyBalances(account: AccountRec, txs: TxRec[], range: DateRange) {
  const start = accountBalances([account], txs, addDays(range.from, -1)).get(account.id) ?? 0;
  const deltas = new Map<ISODate, Minor>();
  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    for (const e of balanceEffects(tx))
      if (e.accountId === account.id) deltas.set(tx.date, (deltas.get(tx.date) ?? 0) + e.amount);
  }
  const out: { date: ISODate; balance: Minor }[] = [];
  let running = start;
  for (let d = range.from, guard = 0; d <= range.to && guard < 4000; d = addDays(d, 1), guard++) {
    if (d === account.openingDate && account.openingDate >= range.from) running += account.openingBalance;
    running += deltas.get(d) ?? 0;
    out.push({ date: d, balance: running });
  }
  return out;
}

/** Normalise transactions into the base currency. Unconvertible rows are returned separately. */
export function normalizeToBase(txs: TxRec[], fx: Converter): { txs: TxRec[]; unconverted: TxRec[] } {
  const out: TxRec[] = [];
  const unconverted: TxRec[] = [];
  for (const tx of txs) {
    if (tx.currency === fx.base) {
      out.push(tx);
      continue;
    }
    const amount = fx.convert(tx.amount, tx.currency, tx.date);
    if (amount == null) {
      unconverted.push(tx);
      continue;
    }
    const conv = (v: Minor | null) => (v == null ? null : fx.convert(v, tx.currency, tx.date));
    out.push({
      ...tx,
      amount,
      currency: fx.base,
      principalAmount: conv(tx.principalAmount),
      interestAmount: conv(tx.interestAmount),
      toAmount: null,
    });
  }
  return { txs: out, unconverted };
}

export interface PeriodSummary {
  income: Minor;
  expenses: Minor;
  savings: Minor;
  savingsRate: number | null;
  expenseRatio: number | null;
  transactionCount: number;
}

/** Totals for a period. Expects base-currency transactions. */
export function summarize(txs: TxRec[], range: DateRange): PeriodSummary {
  let income = 0;
  let expenses = 0;
  let count = 0;
  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    count++;
    income += incomeOf(tx);
    expenses += expenseOf(tx);
  }
  const savings = income - expenses;
  return {
    income,
    expenses,
    savings,
    savingsRate: income > 0 ? (savings / income) * 100 : null,
    expenseRatio: income > 0 ? (expenses / income) * 100 : null,
    transactionCount: count,
  };
}

export function monthlySeries(txs: TxRec[], range: DateRange) {
  const months = monthsInRange(range);
  const map = new Map(months.map((m) => [m, { month: m, income: 0, expenses: 0, savings: 0 }]));
  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    const row = map.get(monthKey(tx.date));
    if (!row) continue;
    row.income += incomeOf(tx);
    row.expenses += expenseOf(tx);
  }
  for (const r of map.values()) r.savings = r.income - r.expenses;
  return [...map.values()];
}

export type CategoryIndex = Map<string, CategoryRec>;
export function indexCategories(cats: CategoryRec[]): CategoryIndex {
  return new Map(cats.map((c) => [c.id, c]));
}

export function topCategoryId(id: string | null, idx: CategoryIndex): string | null {
  let cur = id ? idx.get(id) : undefined;
  let guard = 0;
  while (cur?.parentId && guard++ < 10) cur = idx.get(cur.parentId);
  return cur?.id ?? null;
}

/** All descendant ids of a category including itself. */
export function categorySubtree(id: string, cats: CategoryRec[]): Set<string> {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cats)
      if (c.parentId && out.has(c.parentId) && !out.has(c.id)) {
        out.add(c.id);
        grew = true;
      }
  }
  return out;
}

export type GroupKey = "category" | "topCategory" | "merchant" | "paymentMethod" | "account" | "month" | "week" | "day" | "type";

export interface GroupRow {
  key: string;
  amount: Minor;
  count: number;
}

/** Group expense (or income) amounts. Expects base-currency transactions. */
export function groupBy(
  txs: TxRec[],
  range: DateRange,
  by: GroupKey,
  measure: "expense" | "income",
  idx?: CategoryIndex,
): GroupRow[] {
  const map = new Map<string, GroupRow>();
  const fn = measure === "expense" ? expenseOf : incomeOf;
  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    const v = fn(tx);
    if (v === 0) continue;
    let key: string;
    switch (by) {
      case "category":
        key = tx.categoryId ?? "uncategorized";
        break;
      case "topCategory":
        key = (idx && topCategoryId(tx.categoryId, idx)) ?? "uncategorized";
        break;
      case "merchant":
        key = tx.merchant?.trim() || "(no merchant)";
        break;
      case "paymentMethod":
        key = tx.paymentMethod ?? "OTHER";
        break;
      case "account":
        key = tx.accountId;
        break;
      case "month":
        key = monthKey(tx.date);
        break;
      case "week":
        key = startOfWeek(tx.date);
        break;
      case "day":
        key = tx.date;
        break;
      case "type":
        key = tx.type;
        break;
    }
    const row = map.get(key) ?? { key, amount: 0, count: 0 };
    row.amount += v;
    row.count++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export function essentialSplit(txs: TxRec[], range: DateRange, idx: CategoryIndex) {
  let essential = 0;
  let discretionary = 0;
  let uncategorized = 0;
  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    const v = expenseOf(tx);
    if (!v) continue;
    const c = tx.categoryId ? idx.get(tx.categoryId) : undefined;
    if (!c) uncategorized += v;
    else {
      // essential flag inherits from the top-level category when the leaf is not flagged
      const top = idx.get(topCategoryId(c.id, idx) ?? "") ?? c;
      if (c.essential || top.essential) essential += v;
      else discretionary += v;
    }
  }
  return { essential, discretionary, uncategorized };
}

export function isLiabilityAccount(a: Pick<AccountRec, "type">) {
  return LIABILITY_ACCOUNT_TYPES.includes(a.type);
}

/** Accounts treated as "cash & equivalents" for the cash-flow statement: everything but loans. */
export function isCashAccount(a: Pick<AccountRec, "type">) {
  return a.type !== "LOAN";
}

export interface CashFlowStatement {
  openingCash: Minor;
  operating: { income: Minor; expenses: Minor; net: Minor };
  investing: { purchases: Minor; sales: Minor; net: Minor };
  financing: { borrowings: Minor; principalRepaid: Minor; net: Minor };
  adjustments: Minor;
  newAccountOpenings: Minor;
  netChange: Minor;
  closingCash: Minor;
  reconciles: boolean;
}

/**
 * Cash-flow statement over cash accounts (all except LOAN). Single-currency
 * (base) accounts only; transfers between two cash accounts net to zero.
 */
export function cashFlowStatement(accounts: AccountRec[], txs: TxRec[], range: DateRange): CashFlowStatement {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const isCash = (id: string | null) => !!id && !!byId.get(id) && isCashAccount(byId.get(id)!);
  const cashAccounts = accounts.filter(isCashAccount);
  const before = accountBalances(cashAccounts, txs, addDays(range.from, -1));
  const after = accountBalances(cashAccounts, txs, range.to);
  let openingCash = 0;
  let closingCash = 0;
  for (const a of cashAccounts) {
    openingCash += before.get(a.id) ?? 0;
    closingCash += after.get(a.id) ?? 0;
  }
  const newAccountOpenings = cashAccounts
    .filter((a) => inRange(a.openingDate, range))
    .reduce((s, a) => s + a.openingBalance, 0);

  const op = { income: 0, expenses: 0, net: 0 };
  const inv = { purchases: 0, sales: 0, net: 0 };
  const fin = { borrowings: 0, principalRepaid: 0, net: 0 };
  let adjustments = 0;

  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    const fromCash = isCash(tx.accountId);
    const toCash = isCash(tx.toAccountId);
    switch (tx.type) {
      case "INCOME":
      case "DIVIDEND":
      case "INTEREST":
        if (fromCash) op.income += tx.amount;
        break;
      case "EXPENSE":
        if (fromCash) op.expenses += tx.amount;
        break;
      case "REFUND":
        if (fromCash) op.expenses -= tx.amount;
        break;
      case "INVESTMENT_BUY":
        if (fromCash) inv.purchases += tx.amount;
        break;
      case "INVESTMENT_SELL":
        if (fromCash) inv.sales += tx.amount;
        break;
      case "LOAN_REPAYMENT": {
        if (!fromCash) break;
        const interest = tx.interestAmount ?? 0;
        op.expenses += interest;
        if (toCash) {
          // repayment into a non-loan account (unusual): only interest leaves cash
          break;
        }
        fin.principalRepaid += tx.amount - interest;
        break;
      }
      case "TRANSFER":
      case "LOAN_DISBURSEMENT":
        if (fromCash && !toCash) fin.principalRepaid += tx.amount; // cash → loan (prepayment)
        else if (!fromCash && toCash) fin.borrowings += tx.toAmount ?? tx.amount; // loan → cash
        else if (fromCash && toCash && tx.toAmount != null && tx.toAmount !== tx.amount)
          adjustments += tx.toAmount - tx.amount; // cross-currency difference
        break;
      case "ADJUSTMENT":
        if (fromCash) adjustments += tx.amount;
        break;
    }
  }
  op.net = op.income - op.expenses;
  inv.net = inv.sales - inv.purchases;
  fin.net = fin.borrowings - fin.principalRepaid;
  const netChange = op.net + inv.net + fin.net + adjustments + newAccountOpenings;
  return {
    openingCash,
    operating: op,
    investing: inv,
    financing: fin,
    adjustments,
    newAccountOpenings,
    netChange,
    closingCash,
    reconciles: openingCash + netChange === closingCash,
  };
}
