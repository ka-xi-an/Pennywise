/**
 * Cross-module workflows on demo data: statements reconcile with each other and with
 * the live context; backup → restore round-trips exactly; the analyst answers from data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { createDefaultCategories } from "@/lib/server/defaults";
import { loadDemoData } from "@/lib/server/services/demo";
import { exportBackup, parseBackup, restoreBackup } from "@/lib/server/services/backup";
import { getCtx } from "@/lib/server/data";
import { buildReport } from "@/lib/server/reports";
import { builtinAnswer } from "@/lib/server/ai/builtin";
import { taxSummary } from "@/lib/server/tax";
import { summarize } from "@/lib/finance/ledger";
import { resolveRange, todayIn } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/format";

let userId = "";
let otherId = "";
const today = todayIn("Asia/Kolkata");

async function mkUser(email: string) {
  const u = await db.user.create({ data: { email, name: email, passwordHash: "x" } });
  await db.userPreference.create({ data: { userId: u.id, onboarded: true } });
  await db.$transaction((tx) => createDefaultCategories(tx, u.id));
  return u.id;
}

beforeAll(async () => {
  userId = await mkUser("wf@test.local");
  otherId = await mkUser("wf2@test.local");
  await loadDemoData(userId, today);
});
afterAll(() => db.$disconnect());

const money = (c: unknown) => (c as { money: number }).money;

describe("statements reconcile", () => {
  it("income statement net savings equals the ledger summary and savings report", async () => {
    const ctx = await getCtx(userId);
    const range = resolveRange("last_6_months", ctx.today);
    const is = await buildReport(ctx, "income-statement", range);
    const savingsRow = is.sections.find((s) => s.total && String(s.total[0]).startsWith("NET SAVINGS"))!;
    const s = summarize(ctx.txs, range);
    expect(money(savingsRow.total![1])).toBe(s.savings);
    const sr = await buildReport(ctx, "savings", range);
    expect(money(sr.sections[0].total![3])).toBe(s.savings);
  });
  it("balance sheet net worth equals the live net worth", async () => {
    const ctx = await getCtx(userId);
    const bs = await buildReport(ctx, "balance-sheet", { from: ctx.today, to: ctx.today });
    const nwRow = bs.sections.find((s) => s.total && s.total[0] === "NET WORTH")!;
    expect(money(nwRow.total![1])).toBe(ctx.netWorth.netWorth);
  });
  it("cash-flow statement reconciles to account balances", async () => {
    const ctx = await getCtx(userId);
    const cf = await buildReport(ctx, "cash-flow", resolveRange("all", ctx.today, { earliest: ctx.earliestDate }));
    const recon = cf.sections.flatMap((s) => s.rows).find((r) => r[0] === "Reconciles to account balances");
    expect(recon?.[1]).toBe("Yes");
  });
  it("never assumes tax rules carry over to a year without configured rules", async () => {
    const ctx = await getCtx(userId);
    const t = await taxSummary(ctx, "2030-31");
    expect(t.estimates).toHaveLength(0);
    expect(t.notes.join(" ")).toMatch(/No tax rules exist for FY 2030-31/);
  });
  it("estimates FY 2025-26 under both regimes from the built-in (unverified) template", async () => {
    const ctx = await getCtx(userId);
    const t = await taxSummary(ctx, "2025-26");
    expect(t.estimates.map((e) => e.regime).sort()).toEqual(["NEW", "OLD"]);
    for (const e of t.estimates) {
      expect(e.verified).toBe(false);
      expect(e.result.totalTax).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("AI analyst (built-in)", () => {
  it("answers net worth with the exact computed figure", async () => {
    const ctx = await getCtx(userId);
    const a = await builtinAnswer(ctx, "What is my current net worth?");
    expect(a).toContain(formatMoney(ctx.netWorth.netWorth, ctx.fmt));
  });
  it("labels forecasts as estimates", async () => {
    const ctx = await getCtx(userId);
    const a = await builtinAnswer(ctx, "What will my cash balance look like in six months?");
    expect(a).toMatch(/Estimate/i);
  });
  it("does not invent data for an empty account", async () => {
    const ctx = await getCtx(otherId);
    const a = await builtinAnswer(ctx, "How much did I spend this month?");
    expect(a).toMatch(/don't have any accounts/);
  });
});

describe("backup & restore", () => {
  it("round-trips all data into another account with remapped IDs", async () => {
    const before = await getCtx(userId);
    const json = await exportBackup(userId);
    const parsed = parseBackup(json);
    expect(parsed.counts.transaction).toBeGreaterThan(200);
    await restoreBackup(otherId, parsed.data);
    const after = await getCtx(otherId);
    expect(after.txs.length).toBe(before.txs.length);
    expect(after.netWorth.netWorth).toBe(before.netWorth.netWorth);
    expect(after.portfolio.marketValue).toBe(before.portfolio.marketValue);
    // IDs are new — the source user's records are untouched
    const overlap = await db.transaction.count({ where: { userId: otherId, id: { in: before.txs.slice(0, 50).map((t) => t.id) } } });
    expect(overlap).toBe(0);
    expect(await db.transaction.count({ where: { userId } })).toBe(before.txsNative.length);
  });
  it("rejects files that are not backups", () => {
    expect(() => parseBackup(JSON.stringify({ hello: 1 }))).toThrow(/not a Ledgerline backup/);
  });
});
