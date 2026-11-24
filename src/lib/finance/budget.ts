/**
 * Budget engine. A budget defines a recurring period (weekly / monthly / annual /
 * custom) and per-category planned amounts. Actual spending for a line is the net
 * expense (expenses − refunds + loan interest) of that category AND all of its
 * subcategories inside the period window — computed from the ledger, never stored.
 *
 * Rollover (envelope style): unspent (or overspent) amounts from previous periods
 * since the budget start carry forward into the current period's available amount.
 */
import type { CategoryRec, DateRange, ISODate, Minor, TxRec } from "./types";
import { addDays, addMonths, daysBetween, endOfMonth, startOfMonth, startOfWeek } from "./dates";
import { categorySubtree, expenseOf, incomeOf } from "./ledger";

export type BudgetPeriod = "WEEKLY" | "MONTHLY" | "ANNUAL" | "CUSTOM";
export type BudgetMethod = "CATEGORY" | "ZERO_BASED" | "FIFTY_THIRTY_TWENTY" | "ENVELOPE";

export const BUDGET_METHOD_LABELS: Record<BudgetMethod, string> = {
  CATEGORY: "Category budget",
  ZERO_BASED: "Zero-based",
  FIFTY_THIRTY_TWENTY: "50 / 30 / 20",
  ENVELOPE: "Envelope",
};

export interface BudgetRec {
  id: string;
  name: string;
  period: BudgetPeriod;
  method: BudgetMethod;
  startDate: ISODate;
  endDate: ISODate | null;
  rollover: boolean;
  expectedIncome: Minor | null;
  active: boolean;
  lines: { id: string; categoryId: string; amount: Minor; group: string | null; isLimit: boolean }[];
}

export const THRESHOLDS = [50, 75, 90, 100] as const;

/** The period window that contains `date`. */
export function periodWindow(b: Pick<BudgetRec, "period" | "startDate" | "endDate">, date: ISODate): DateRange {
  switch (b.period) {
    case "WEEKLY": {
      const s = startOfWeek(date);
      return { from: s, to: addDays(s, 6) };
    }
    case "ANNUAL": {
      // Annual periods are anchored on the budget's start month/day.
      const anchor = b.startDate;
      let from = anchor;
      while (addMonths(from, 12) <= date) from = addMonths(from, 12);
      while (from > date) from = addMonths(from, -12);
      return { from, to: addDays(addMonths(from, 12), -1) };
    }
    case "CUSTOM":
      return { from: b.startDate, to: b.endDate ?? b.startDate };
    case "MONTHLY":
    default:
      return { from: startOfMonth(date), to: endOfMonth(date) };
  }
}

export function previousWindow(b: Pick<BudgetRec, "period" | "startDate" | "endDate">, w: DateRange): DateRange | null {
  if (b.period === "CUSTOM") return null;
  return periodWindow(b, addDays(w.from, -1));
}

export function spentInWindow(txs: TxRec[], categoryIds: Set<string>, w: DateRange): Minor {
  let s = 0;
  for (const tx of txs) {
    if (tx.date < w.from || tx.date > w.to || !tx.categoryId || !categoryIds.has(tx.categoryId)) continue;
    s += expenseOf(tx);
  }
  return s;
}

export type ThresholdLevel = "ok" | "50" | "75" | "90" | "100";

export function thresholdLevel(utilization: number | null): ThresholdLevel {
  if (utilization == null) return "ok";
  if (utilization >= 100) return "100";
  if (utilization >= 90) return "90";
  if (utilization >= 75) return "75";
  if (utilization >= 50) return "50";
  return "ok";
}

export interface LineStatus {
  lineId: string;
  categoryId: string;
  group: string | null;
  isLimit: boolean;
  planned: Minor;
  rolloverIn: Minor;
  available: Minor;
  actual: Minor;
  remaining: Minor;
  utilization: number | null;
  dailyAllowance: Minor | null;
  projected: Minor;
  level: ThresholdLevel;
}

export interface BudgetStatus {
  window: DateRange;
  daysTotal: number;
  daysElapsed: number;
  daysLeft: number;
  lines: LineStatus[];
  planned: Minor;
  available: Minor;
  actual: Minor;
  remaining: Minor;
  utilization: number | null;
  projected: Minor;
  income: Minor;
  unbudgetedSpending: Minor;
  /** zero-based: income − total planned (should be 0) */
  unassigned: Minor | null;
  groups: { group: string; planned: Minor; actual: Minor; targetPct: number | null; actualPct: number | null }[];
}

const FIFTY_THIRTY_TWENTY_TARGETS: Record<string, number> = { NEEDS: 50, WANTS: 30, SAVINGS: 20 };

export function budgetStatus(
  b: BudgetRec,
  txs: TxRec[],
  categories: CategoryRec[],
  today: ISODate,
  at: ISODate = today,
): BudgetStatus {
  const window = periodWindow(b, at);
  const daysTotal = daysBetween(window.from, window.to) + 1;
  const daysElapsed = Math.min(daysTotal, Math.max(0, daysBetween(window.from, today) + 1));
  const daysLeft = Math.max(0, daysTotal - daysElapsed);
  const covered = new Set<string>();

  const lines: LineStatus[] = b.lines.map((line) => {
    const ids = categorySubtree(line.categoryId, categories);
    ids.forEach((i) => covered.add(i));
    const actual = spentInWindow(txs, ids, window);
    let rolloverIn = 0;
    if (b.rollover) {
      let w = previousWindow(b, window);
      let guard = 0;
      while (w && w.to >= b.startDate && guard++ < 60) {
        rolloverIn += line.amount - spentInWindow(txs, ids, w);
        w = previousWindow(b, w);
      }
    }
    const available = line.amount + rolloverIn;
    const remaining = available - actual;
    const utilization = available > 0 ? (actual / available) * 100 : actual > 0 ? 100 : null;
    const projected =
      today < window.from ? 0 : today > window.to ? actual : Math.round((actual / Math.max(1, daysElapsed)) * daysTotal);
    return {
      lineId: line.id,
      categoryId: line.categoryId,
      group: line.group,
      isLimit: line.isLimit,
      planned: line.amount,
      rolloverIn,
      available,
      actual,
      remaining,
      utilization,
      dailyAllowance: daysLeft > 0 ? Math.max(0, Math.floor(remaining / daysLeft)) : null,
      projected,
      level: thresholdLevel(utilization),
    };
  });

  let income = 0;
  let unbudgetedSpending = 0;
  for (const tx of txs) {
    if (tx.date < window.from || tx.date > window.to) continue;
    income += incomeOf(tx);
    const e = expenseOf(tx);
    if (e && (!tx.categoryId || !covered.has(tx.categoryId))) unbudgetedSpending += e;
  }

  const planned = lines.reduce((s, l) => s + l.planned, 0);
  const available = lines.reduce((s, l) => s + l.available, 0);
  const actual = lines.reduce((s, l) => s + l.actual, 0);
  const projected = lines.reduce((s, l) => s + l.projected, 0);
  const groupMap = new Map<string, { planned: Minor; actual: Minor }>();
  for (const l of lines) {
    const g = l.group ?? "UNGROUPED";
    const row = groupMap.get(g) ?? { planned: 0, actual: 0 };
    row.planned += l.planned;
    row.actual += l.actual;
    groupMap.set(g, row);
  }
  const base = b.expectedIncome ?? income;
  const groups = [...groupMap.entries()].map(([group, v]) => ({
    group,
    ...v,
    targetPct: b.method === "FIFTY_THIRTY_TWENTY" ? FIFTY_THIRTY_TWENTY_TARGETS[group] ?? null : null,
    actualPct: base > 0 ? (v.actual / base) * 100 : null,
  }));

  return {
    window,
    daysTotal,
    daysElapsed,
    daysLeft,
    lines,
    planned,
    available,
    actual,
    remaining: available - actual,
    utilization: available > 0 ? (actual / available) * 100 : null,
    projected,
    income,
    unbudgetedSpending,
    unassigned: b.method === "ZERO_BASED" ? (b.expectedIncome ?? income) - planned : null,
    groups,
  };
}

/** Split an income figure 50/30/20 into needs / wants / savings targets. */
export function fiftyThirtyTwenty(income: Minor) {
  const needs = Math.round(income * 0.5);
  const wants = Math.round(income * 0.3);
  return { needs, wants, savings: income - needs - wants };
}

/** Suggest a monthly budget per category from the trailing average of past spending. */
export function suggestFromHistory(txs: TxRec[], categoryIds: string[], categories: CategoryRec[], today: ISODate, months = 3) {
  const end = addDays(startOfMonth(today), -1);
  const start = addMonths(startOfMonth(today), -months);
  return categoryIds.map((id) => {
    const spent = spentInWindow(txs, categorySubtree(id, categories), { from: start, to: end });
    return { categoryId: id, average: Math.round(spent / months) };
  });
}
