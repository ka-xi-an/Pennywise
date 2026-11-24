/**
 * Spending intelligence derived purely from recorded transactions:
 * unusual transactions, recurring-payment candidates and period-over-period
 * explanations. Statistical rules are documented next to each function.
 */
import type { DateRange, ISODate, Minor, TxRec } from "./types";
import { addDays, daysBetween, inRange, monthKey } from "./dates";
import { expenseOf, groupBy, type CategoryIndex } from "./ledger";

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface Anomaly {
  tx: TxRec;
  reason: string;
  ratio: number | null;
}

/**
 * A recent expense is "unusual" when, compared with the previous 180 days of the
 * same category (≥ 4 data points), it exceeds BOTH 3× the median and mean + 3σ —
 * or when it is a first-ever payment to a merchant above the large-expense threshold.
 */
export function detectAnomalies(txs: TxRec[], today: ISODate, largeThreshold: Minor, lookbackDays = 30): Anomaly[] {
  const recentFrom = addDays(today, -lookbackDays);
  const histFrom = addDays(recentFrom, -180);
  const expenses = txs.filter((t) => t.type === "EXPENSE");
  const out: Anomaly[] = [];
  const seenMerchants = new Map<string, ISODate>();
  for (const t of [...expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    const m = t.merchant?.trim().toLowerCase();
    if (m && !seenMerchants.has(m)) seenMerchants.set(m, t.date);
  }
  for (const t of expenses) {
    if (t.date < recentFrom || t.date > today) continue;
    const hist = expenses
      .filter((h) => h.id !== t.id && h.categoryId === t.categoryId && h.date >= histFrom && h.date < recentFrom)
      .map((h) => h.amount);
    if (hist.length >= 4) {
      const med = median(hist);
      const mean = hist.reduce((s, v) => s + v, 0) / hist.length;
      const sd = Math.sqrt(hist.reduce((s, v) => s + (v - mean) ** 2, 0) / hist.length);
      if (t.amount > 3 * med && t.amount > mean + 3 * sd) {
        out.push({ tx: t, reason: `${(t.amount / med).toFixed(1)}× the usual amount for this category`, ratio: t.amount / med });
        continue;
      }
    }
    const m = t.merchant?.trim().toLowerCase();
    if (m && seenMerchants.get(m) === t.date && t.amount >= largeThreshold) {
      out.push({ tx: t, reason: "Large first-time payment to this merchant", ratio: null });
    }
  }
  return out.sort((a, b) => b.tx.amount - a.tx.amount);
}

export interface RecurringCandidate {
  merchant: string;
  averageAmount: Minor;
  occurrences: number;
  lastDate: ISODate;
  cadenceDays: number;
  categoryId: string | null;
  accountId: string;
}

/**
 * Detect likely subscriptions/bills: same merchant, ≥ 3 charges in distinct months,
 * amounts within ±15% of the median, median gap 25–35 days (monthly) or 350–380 (yearly).
 */
export function detectRecurring(txs: TxRec[], knownMerchants: Set<string>): RecurringCandidate[] {
  const byMerchant = new Map<string, TxRec[]>();
  for (const t of txs) {
    if (t.type !== "EXPENSE" || !t.merchant) continue;
    const k = t.merchant.trim().toLowerCase();
    if (knownMerchants.has(k)) continue;
    if (!byMerchant.has(k)) byMerchant.set(k, []);
    byMerchant.get(k)!.push(t);
  }
  const out: RecurringCandidate[] = [];
  for (const list of byMerchant.values()) {
    if (list.length < 3) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const months = new Set(list.map((t) => monthKey(t.date)));
    if (months.size < 3) continue;
    const amounts = list.map((t) => t.amount);
    const med = median(amounts);
    if (!amounts.every((a) => Math.abs(a - med) <= med * 0.15)) continue;
    const gaps = list.slice(1).map((t, i) => daysBetween(list[i].date, t.date));
    const g = median(gaps);
    if (!((g >= 25 && g <= 35) || (g >= 350 && g <= 380))) continue;
    const last = list.at(-1)!;
    out.push({
      merchant: last.merchant!,
      averageAmount: Math.round(med),
      occurrences: list.length,
      lastDate: last.date,
      cadenceDays: g,
      categoryId: last.categoryId,
      accountId: last.accountId,
    });
  }
  return out.sort((a, b) => b.averageAmount - a.averageAmount);
}

export interface ChangeDriver {
  categoryId: string;
  current: Minor;
  previous: Minor;
  delta: Minor;
}

/** Explain a change in spending between two periods by top-level category deltas. */
export function spendingDrivers(txs: TxRec[], cur: DateRange, prev: DateRange, idx: CategoryIndex): ChangeDriver[] {
  const a = new Map(groupBy(txs, cur, "topCategory", "expense", idx).map((r) => [r.key, r.amount]));
  const b = new Map(groupBy(txs, prev, "topCategory", "expense", idx).map((r) => [r.key, r.amount]));
  const keys = new Set([...a.keys(), ...b.keys()]);
  return [...keys]
    .map((k) => ({ categoryId: k, current: a.get(k) ?? 0, previous: b.get(k) ?? 0, delta: (a.get(k) ?? 0) - (b.get(k) ?? 0) }))
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}

export function largeExpenses(txs: TxRec[], range: DateRange, threshold: Minor) {
  return txs.filter((t) => inRange(t.date, range) && expenseOf(t) >= threshold).sort((a, b) => b.amount - a.amount);
}
