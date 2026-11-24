import "server-only";
import { db, big } from "../db";
import type { Ctx } from "../data";
import { accountBalances } from "@/lib/finance/ledger";
import { buildPortfolio } from "@/lib/finance/investments";
import { computeNetWorth } from "@/lib/finance/networth";
import { addDays, addMonths, endOfMonth, monthsInRange, startOfMonth } from "@/lib/finance/dates";

/** Upserts the current month's RECORDED snapshot from live data (one row per month). */
export async function recordCurrentSnapshot(ctx: Ctx) {
  if (!ctx.accounts.length && !ctx.holdings.length && !ctx.assets.length) return;
  const date = endOfMonth(ctx.today);
  const nw = ctx.netWorth;
  const data = {
    totalAssets: big(nw.totalAssets),
    totalLiabilities: big(nw.totalLiabilities),
    netWorth: big(nw.netWorth),
    breakdown: JSON.stringify(nw.byGroup),
    source: "RECORDED",
  };
  await db.netWorthSnapshot.upsert({
    where: { userId_date: { userId: ctx.userId, date } },
    create: { userId: ctx.userId, date, ...data },
    update: data,
  });
}

/**
 * Backfills month-end snapshots before the first recorded one from ledger history.
 * Account balances are exact as of each month end. Holdings are valued at COST as of
 * that date (historical prices are unknown) and manual assets/liabilities at their
 * recorded values when their valuation/as-of date is on or before the month end.
 * Rows are marked BACKFILLED so the UI labels them as estimates.
 */
export async function backfillSnapshots(ctx: Ctx) {
  const firstRecorded = await db.netWorthSnapshot.findFirst({
    where: { userId: ctx.userId, source: "RECORDED" },
    orderBy: { date: "asc" },
  });
  const until = firstRecorded ? addDays(startOfMonth(firstRecorded.date), -1) : addDays(startOfMonth(ctx.today), -1);
  const from = startOfMonth(ctx.earliestDate);
  if (from > until) return 0;
  const months = monthsInRange({ from, to: until }).slice(-120);
  let count = 0;
  for (const m of months) {
    const asOf = endOfMonth(`${m}-01`);
    const balances = accountBalances(ctx.accounts, ctx.txsNative, asOf);
    const holdings = ctx.holdings.map((h) => ({ ...h, currentPrice: null, currentValue: null }));
    const pf = buildPortfolio(
      holdings,
      ctx.invTxs.filter((t) => t.date <= asOf),
      asOf,
    );
    const nw = computeNetWorth({
      accounts: ctx.accounts.filter((a) => a.openingDate <= asOf),
      balances,
      positions: pf.positions,
      assets: ctx.assets.filter((a) => (a.purchaseDate ?? a.valuationDate) <= asOf).map((a) => ({ ...a, currentValue: a.valuationDate <= asOf ? a.currentValue : a.purchaseValue ?? a.currentValue })),
      liabilities: ctx.liabilities.filter((l) => l.asOfDate <= asOf),
      fx: ctx.fx,
      today: asOf,
    });
    const data = {
      totalAssets: big(nw.totalAssets),
      totalLiabilities: big(nw.totalLiabilities),
      netWorth: big(nw.netWorth),
      breakdown: JSON.stringify(nw.byGroup),
      source: "BACKFILLED",
    };
    const existing = await db.netWorthSnapshot.findUnique({ where: { userId_date: { userId: ctx.userId, date: asOf } } });
    if (existing?.source === "RECORDED") continue;
    await db.netWorthSnapshot.upsert({
      where: { userId_date: { userId: ctx.userId, date: asOf } },
      create: { userId: ctx.userId, date: asOf, ...data },
      update: data,
    });
    count++;
  }
  return count;
}

export async function loadSnapshots(userId: string, months = 120) {
  const since = addMonths(new Date().toISOString().slice(0, 10), -months);
  return db.netWorthSnapshot.findMany({ where: { userId, date: { gte: since } }, orderBy: { date: "asc" } });
}
