"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { isISODate } from "@/lib/finance/dates";

const lineSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().int().min(0).max(10 ** 15),
  group: z.enum(["NEEDS", "WANTS", "SAVINGS"]).nullable().optional(),
  isLimit: z.boolean().optional(),
});

const budgetSchema = z.object({
  id: z.string().nullable().optional(),
  name: z.string().trim().min(1, "Budget name is required").max(80),
  period: z.enum(["WEEKLY", "MONTHLY", "ANNUAL", "CUSTOM"]),
  method: z.enum(["CATEGORY", "ZERO_BASED", "FIFTY_THIRTY_TWENTY", "ENVELOPE"]),
  startDate: z.string().refine(isISODate, "Start date is invalid"),
  endDate: z.string().nullable().optional(),
  rollover: z.boolean(),
  expectedIncome: z.number().int().min(0).nullable().optional(),
  lines: z.array(lineSchema).max(300),
});

export type BudgetInput = z.infer<typeof budgetSchema>;

export async function saveBudget(input: BudgetInput) {
  const user = await requireUser();
  return run(async () => {
    const r = budgetSchema.safeParse(input);
    if (!r.success) return fail(r.error.issues[0]?.message ?? "Invalid budget");
    const d = r.data;
    if (d.period === "CUSTOM" && (!d.endDate || !isISODate(d.endDate) || d.endDate < d.startDate))
      return fail("Custom budgets need an end date after the start date");
    const lines = d.lines.filter((l) => l.amount > 0);
    if (!lines.length) return fail("Add at least one category with a planned amount");
    if (new Set(lines.map((l) => l.categoryId)).size !== lines.length) return fail("Each category can appear only once");
    const owned = await db.category.findMany({ where: { id: { in: lines.map((l) => l.categoryId) }, userId: user.id, kind: "EXPENSE" } });
    if (owned.length !== lines.length) return fail("Budgets can only include your expense categories");
    if (d.method === "ZERO_BASED" && !d.expectedIncome) return fail("Zero-based budgets need the expected income to assign");
    const data = {
      name: d.name,
      period: d.period,
      method: d.method,
      startDate: d.startDate,
      endDate: d.period === "CUSTOM" ? d.endDate : null,
      rollover: d.rollover,
      expectedIncome: d.expectedIncome != null ? big(d.expectedIncome) : null,
    };
    const budget = await db.$transaction(async (tx) => {
      let b;
      if (d.id) {
        const existing = await tx.budget.findFirst({ where: { id: d.id, userId: user.id } });
        if (!existing) throw new Error("not found");
        b = await tx.budget.update({ where: { id: d.id }, data });
        await tx.budgetLine.deleteMany({ where: { budgetId: d.id } });
      } else b = await tx.budget.create({ data: { ...data, userId: user.id } });
      await tx.budgetLine.createMany({
        data: lines.map((l) => ({ budgetId: b.id, categoryId: l.categoryId, amount: big(l.amount), group: l.group ?? null, isLimit: !!l.isLimit })),
      });
      return b;
    });
    await audit(user.id, d.id ? "budget.update" : "budget.create", "Budget", budget.id);
    revalidateAll();
    return { ok: true as const, message: d.id ? "Budget updated" : "Budget created", redirect: `/budgets/${budget.id}` };
  });
}

export async function deleteBudget(id: string) {
  const user = await requireUser();
  await db.budget.deleteMany({ where: { id, userId: user.id } });
  await audit(user.id, "budget.delete", "Budget", id);
  revalidateAll();
  return { ok: true as const, message: "Budget deleted", redirect: "/budgets" };
}

export async function toggleBudget(id: string, active: boolean) {
  const user = await requireUser();
  await db.budget.updateMany({ where: { id, userId: user.id }, data: { active } });
  revalidateAll();
  return ok(active ? "Budget activated" : "Budget archived");
}

export async function setLimit(lineId: string, isLimit: boolean) {
  const user = await requireUser();
  const line = await db.budgetLine.findFirst({ where: { id: lineId, budget: { userId: user.id } } });
  if (!line) return fail("Not found");
  await db.budgetLine.update({ where: { id: lineId }, data: { isLimit } });
  revalidateAll();
  return ok(isLimit ? "Marked as a hard spending limit" : "Limit removed");
}
