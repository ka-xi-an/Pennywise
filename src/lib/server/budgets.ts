import "server-only";
import { cache } from "react";
import { db, n } from "./db";
import type { BudgetRec, BudgetMethod, BudgetPeriod } from "@/lib/finance/budget";

export const loadBudgets = cache(async (userId: string): Promise<(BudgetRec & { isDemo: boolean })[]> => {
  const rows = await db.budget.findMany({
    where: { userId },
    include: { lines: true },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    period: b.period as BudgetPeriod,
    method: b.method as BudgetMethod,
    startDate: b.startDate,
    endDate: b.endDate,
    rollover: b.rollover,
    expectedIncome: n(b.expectedIncome),
    active: b.active,
    isDemo: b.isDemo,
    lines: b.lines.map((l) => ({ id: l.id, categoryId: l.categoryId, amount: n(l.amount), group: l.group, isLimit: l.isLimit })),
  }));
});
