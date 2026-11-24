import "server-only";
import type { Ctx } from "./data";
import { categoryLabel, categoryColor } from "./data";
import { groupBy, type GroupKey } from "../finance/ledger";
import { endOfMonth, monthsInRange } from "../finance/dates";
import type { DateRange } from "../finance/types";

/** Monthly amounts stacked by top-level category (top N + Other) for charts. */
export function stackedByCategory(ctx: Ctx, range: DateRange, measure: "income" | "expense", top = 5) {
  const totals = groupBy(ctx.txs, range, "topCategory", measure, ctx.catIdx);
  const keys = totals.slice(0, top).map((t) => t.key);
  const months = monthsInRange(range);
  const data = months.map((m) => {
    const r = { from: `${m}-01` < range.from ? range.from : `${m}-01`, to: endOfMonth(`${m}-01`) > range.to ? range.to : endOfMonth(`${m}-01`) };
    const rows = groupBy(ctx.txs, r, "topCategory", measure, ctx.catIdx);
    const row: Record<string, string | number> = { x: m };
    let other = 0;
    for (const g of rows) {
      if (keys.includes(g.key)) row[g.key] = g.amount;
      else other += g.amount;
    }
    for (const k of keys) row[k] ??= 0;
    if (totals.length > top) row.other = other;
    return row;
  });
  const series = [
    ...keys.map((k, i) => ({ key: k, name: categoryLabel(ctx, k), slot: i })),
    ...(totals.length > top ? [{ key: "other", name: "Other", slot: 7 }] : []),
  ];
  return { data, series, totals };
}

/** Period-over-period comparison table by a grouping. */
export function compareGroups(ctx: Ctx, cur: DateRange, prev: DateRange, by: GroupKey, measure: "income" | "expense") {
  const a = groupBy(ctx.txs, cur, by, measure, ctx.catIdx);
  const b = new Map(groupBy(ctx.txs, prev, by, measure, ctx.catIdx).map((r) => [r.key, r.amount]));
  const keys = new Set([...a.map((r) => r.key), ...b.keys()]);
  return [...keys]
    .map((k) => {
      const c = a.find((r) => r.key === k);
      const p = b.get(k) ?? 0;
      return {
        key: k,
        label: by === "topCategory" || by === "category" ? categoryLabel(ctx, k) : k,
        color: by === "topCategory" || by === "category" ? categoryColor(ctx, k) : undefined,
        current: c?.amount ?? 0,
        count: c?.count ?? 0,
        previous: p,
        change: p ? (((c?.amount ?? 0) - p) / Math.abs(p)) * 100 : null,
      };
    })
    .sort((x, y) => y.current - x.current);
}
