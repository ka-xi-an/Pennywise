import "server-only";
import type { Ctx } from "./data";
import { keyMetrics } from "./data";
import { suggestFromHistory } from "../finance/budget";

/** Expense categories with trailing 3-month average monthly spend for the budget builder. */
export function builderData(ctx: Ctx) {
  const cats = ctx.categories.filter((c) => c.kind === "EXPENSE" && !c.archived);
  const ordered = cats.filter((c) => !c.parentId).flatMap((p) => [p, ...cats.filter((c) => c.parentId === p.id)]);
  const avg = new Map(suggestFromHistory(ctx.txs, ordered.map((c) => c.id), ctx.categories, ctx.today, 3).map((s) => [s.categoryId, s.average]));
  return {
    categories: ordered.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, essential: c.essential, average: avg.get(c.id) ?? 0 })),
    avgIncome: keyMetrics(ctx).avgMonthlyIncome,
  };
}
