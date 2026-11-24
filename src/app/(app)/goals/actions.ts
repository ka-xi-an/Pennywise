"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { decimalStr, intStr, isoDate, money, optDate, optId, optMoney, optStr } from "@/lib/validation";
import { GOAL_TYPES } from "@/lib/finance/goals";

const goalSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Goal name is required").max(80),
  type: z.enum(GOAL_TYPES),
  targetAmount: money("Target amount", { positive: true }),
  targetDate: optDate("Target date"),
  priority: intStr("Priority", 1, 3),
  monthlyContribution: optMoney("Monthly contribution"),
  trackingMode: z.enum(["MANUAL", "ACCOUNTS", "NET_WORTH"]),
  startingAmount: optMoney("Amount saved so far"),
  expectedReturn: decimalStr("Expected return", { optional: true, min: 0, max: 30 }),
  accountIds: z.array(z.string()).optional().default([]),
  notes: optStr(1000),
});

export async function saveGoal(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(goalSchema, fd);
    if (p.error) return p.error;
    const { id, accountIds, ...d } = p.data;
    if (d.trackingMode === "ACCOUNTS" && !accountIds.length) return fail("Link at least one account", { accountIds: "Required" });
    const owned = await db.account.findMany({ where: { id: { in: accountIds }, userId: user.id }, select: { id: true } });
    const data = {
      ...d,
      targetAmount: big(d.targetAmount),
      monthlyContribution: big(d.monthlyContribution ?? 0),
      startingAmount: big(d.startingAmount ?? 0),
    };
    const goal = await db.$transaction(async (tx) => {
      let g;
      if (id) {
        const existing = await tx.goal.findFirst({ where: { id, userId: user.id } });
        if (!existing) throw new Error("Goal not found");
        g = await tx.goal.update({ where: { id }, data });
        await tx.goalAccount.deleteMany({ where: { goalId: id } });
      } else g = await tx.goal.create({ data: { ...data, userId: user.id } });
      if (d.trackingMode === "ACCOUNTS") await tx.goalAccount.createMany({ data: owned.map((a) => ({ goalId: g.id, accountId: a.id })) });
      return g;
    });
    await audit(user.id, id ? "goal.update" : "goal.create", "Goal", goal.id);
    revalidateAll();
    return ok(id ? "Goal updated" : "Goal created");
  });
}

export async function deleteGoal(id: string) {
  const user = await requireUser();
  await db.goal.deleteMany({ where: { id, userId: user.id } });
  await audit(user.id, "goal.delete", "Goal", id);
  revalidateAll();
  return ok("Goal deleted");
}

export async function setGoalStatus(id: string, status: "ACTIVE" | "ACHIEVED" | "PAUSED") {
  const user = await requireUser();
  await db.goal.updateMany({ where: { id, userId: user.id }, data: { status } });
  revalidateAll();
  return ok(`Goal marked ${status.toLowerCase()}`);
}

const contribSchema = z.object({
  goalId: z.string().min(1),
  date: isoDate(),
  amount: money("Amount", { allowNegative: true }),
  note: optStr(200),
});

/** Records progress toward a goal. This is a tracking entry, not a ledger transaction. */
export async function addContribution(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(contribSchema, fd);
    if (p.error) return p.error;
    if (p.data.amount === 0) return fail("Amount cannot be zero", { amount: "Required" });
    const goal = await db.goal.findFirst({ where: { id: p.data.goalId, userId: user.id } });
    if (!goal) return fail("Goal not found");
    await db.goalContribution.create({ data: { ...p.data, amount: big(p.data.amount) } });
    revalidateAll();
    return ok(p.data.amount > 0 ? "Contribution recorded" : "Withdrawal recorded");
  });
}

export async function deleteContribution(id: string) {
  const user = await requireUser();
  const c = await db.goalContribution.findFirst({ where: { id, goal: { userId: user.id } } });
  if (!c) return fail("Not found");
  await db.goalContribution.delete({ where: { id } });
  revalidateAll();
  return ok("Entry removed");
}
