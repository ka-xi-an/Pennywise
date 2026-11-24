import "server-only";
import type { Ctx } from "./data";
import { categoryLabel, keyMetrics } from "./data";
import { addDays, addMonths, endOfMonth, startOfMonth } from "../finance/dates";
import { summarize } from "../finance/ledger";
import { detectAnomalies, detectRecurring, spendingDrivers } from "../finance/insights";
import { upcomingMaturities } from "../finance/investments";
import { budgetStatus } from "../finance/budget";
import { formatDate, formatMoney, formatPct } from "../format";
import { loadBudgets } from "./budgets";

export interface Insight {
  id: string;
  tone: "pos" | "neg" | "warn" | "info" | "ai";
  title: string;
  body: string;
  link?: string;
  priority: number; // lower = more important
}

/** Rule-based insights computed from stored records only. */
export async function buildInsights(ctx: Ctx): Promise<Insight[]> {
  const out: Insight[] = [];
  const f = (m: number) => formatMoney(m, ctx.fmt);
  const m = keyMetrics(ctx);
  const thisMonth = { from: startOfMonth(ctx.today), to: endOfMonth(ctx.today) };
  const lastMonth = { from: addMonths(thisMonth.from, -1), to: addDays(thisMonth.from, -1) };
  // Compare month-to-date against the same number of days last month (fair comparison).
  const dayOfMonth = Number(ctx.today.slice(8));
  const lastMtd = { from: lastMonth.from, to: addDays(lastMonth.from, dayOfMonth - 1) > lastMonth.to ? lastMonth.to : addDays(lastMonth.from, dayOfMonth - 1) };
  const cur = summarize(ctx.txs, { from: thisMonth.from, to: ctx.today });
  const prev = summarize(ctx.txs, lastMtd);

  if (prev.expenses > 0 && cur.expenses > 0) {
    const change = ((cur.expenses - prev.expenses) / prev.expenses) * 100;
    if (Math.abs(change) >= 10) {
      const drivers = spendingDrivers(ctx.txs, { from: thisMonth.from, to: ctx.today }, lastMtd, ctx.catIdx).slice(0, 2);
      const why = drivers
        .filter((d) => d.delta !== 0)
        .map((d) => `${categoryLabel(ctx, d.categoryId)} ${d.delta > 0 ? "+" : "−"}${f(Math.abs(d.delta))}`)
        .join(", ");
      out.push({
        id: "spend-change",
        tone: change > 0 ? "warn" : "pos",
        title: `Spending is ${change > 0 ? "up" : "down"} ${formatPct(Math.abs(change), 0)} month-to-date`,
        body: `${f(cur.expenses)} so far vs ${f(prev.expenses)} by the same day last month.${why ? ` Biggest movers: ${why}.` : ""}`,
        link: "/expenses",
        priority: 2,
      });
    }
  }

  if (m.savingsRate != null) {
    out.push({
      id: "savings-rate",
      tone: m.savingsRate >= 20 ? "pos" : m.savingsRate >= 0 ? "info" : "neg",
      title: `Savings rate ${formatPct(m.savingsRate)} (${m.basis})`,
      body:
        m.savingsRate >= 20
          ? `You keep ${f(m.avgMonthlySavings)} of ${f(m.avgMonthlyIncome)} average monthly income — a strong rate.`
          : m.savingsRate >= 0
            ? `Average monthly savings ${f(m.avgMonthlySavings)}. Reaching 20% would mean saving ${f(Math.round(m.avgMonthlyIncome * 0.2))}/month.`
            : `Expenses exceeded income by ${f(-m.avgMonthlySavings)} per month on average.`,
      link: "/analytics?tab=savings",
      priority: 3,
    });
  }

  if (m.emergencyMonths != null && m.emergencyMonths < ctx.prefs.emergencyFundMonths) {
    out.push({
      id: "emergency",
      tone: m.emergencyMonths < 3 ? "neg" : "warn",
      title: `Emergency cover: ${m.emergencyMonths.toFixed(1)} months`,
      body: `Liquid cash ${f(ctx.netWorth.liquidAssets)} vs a ${ctx.prefs.emergencyFundMonths}-month target of ${f(m.avgMonthlyExpenses * ctx.prefs.emergencyFundMonths)}.`,
      link: "/planning/emergency",
      priority: 2,
    });
  }

  const budgets = await loadBudgets(ctx.userId);
  for (const b of budgets.filter((x) => x.active)) {
    const s = budgetStatus(b, ctx.txs, ctx.categories, ctx.today);
    const risky = s.lines.filter((l) => l.projected > l.available && l.available > 0).sort((a, b2) => b2.projected - b2.available - (a.projected - a.available));
    if (risky[0]) {
      const l = risky[0];
      out.push({
        id: `budget-${b.id}`,
        tone: l.actual > l.available ? "neg" : "warn",
        title: `${categoryLabel(ctx, l.categoryId)} is on pace to exceed its budget`,
        body: `${f(l.actual)} spent of ${f(l.available)}; projected ${f(l.projected)} by ${formatDate(s.window.to, ctx.fmt)} at the current pace.`,
        link: `/budgets/${b.id}`,
        priority: 1,
      });
    }
  }

  for (const a of detectAnomalies(ctx.txs, ctx.today, ctx.prefs.largeExpenseThreshold, 30).slice(0, 2)) {
    out.push({
      id: `anomaly-${a.tx.id}`,
      tone: "warn",
      title: `Unusual: ${f(a.tx.amount)} at ${a.tx.merchant ?? "unknown merchant"}`,
      body: `${categoryLabel(ctx, a.tx.categoryId)} on ${formatDate(a.tx.date, ctx.fmt)} — ${a.reason}.`,
      link: "/analyst/intelligence",
      priority: 2,
    });
  }

  const known = new Set(ctx.rules.map((r) => (r.merchant ?? r.name).trim().toLowerCase()));
  const candidates = detectRecurring(ctx.txs, known);
  if (candidates.length) {
    out.push({
      id: "recurring-candidates",
      tone: "ai",
      title: `${candidates.length} possible subscription${candidates.length > 1 ? "s" : ""} detected`,
      body: `${candidates
        .slice(0, 3)
        .map((c) => `${c.merchant} (${f(c.averageAmount)})`)
        .join(", ")} repeat on a regular cadence but aren't tracked as bills.`,
      link: "/analyst/intelligence",
      priority: 4,
    });
  }

  for (const mt of upcomingMaturities(ctx.holdings, ctx.today, 45)) {
    out.push({
      id: `maturity-${mt.holding.id}`,
      tone: "info",
      title: `${mt.holding.name} matures in ${mt.daysLeft} days`,
      body: `Maturity on ${formatDate(mt.holding.maturityDate, ctx.fmt)}. Decide whether to renew or redeploy.`,
      link: `/investments/${mt.holding.id}`,
      priority: 3,
    });
  }

  if (ctx.portfolio.unpricedCount > 0) {
    out.push({
      id: "unpriced",
      tone: "info",
      title: `${ctx.portfolio.unpricedCount} holding${ctx.portfolio.unpricedCount > 1 ? "s" : ""} without a current price`,
      body: "They're valued at cost until you enter a price, so returns may be understated.",
      link: "/investments/holdings",
      priority: 5,
    });
  }
  const stale = ctx.holdings.filter((h) => h.priceDate && h.priceDate < addDays(ctx.today, -45) && h.status === "ACTIVE");
  if (stale.length) {
    out.push({
      id: "stale-prices",
      tone: "info",
      title: `${stale.length} valuation${stale.length > 1 ? "s are" : " is"} over 45 days old`,
      body: "Update prices to keep net worth and returns current.",
      link: "/investments/holdings",
      priority: 6,
    });
  }

  if (m.creditUtilization != null && m.creditUtilization > 30) {
    out.push({
      id: "credit-util",
      tone: m.creditUtilization > 50 ? "neg" : "warn",
      title: `Credit card utilization at ${formatPct(m.creditUtilization, 0)}`,
      body: "Lenders generally prefer utilization under 30% of your total limit.",
      link: "/accounts?group=credit",
      priority: 3,
    });
  }
  if (m.debtToIncome != null && m.debtToIncome > 40) {
    out.push({
      id: "dti",
      tone: "neg",
      title: `EMIs take ${formatPct(m.debtToIncome, 0)} of income`,
      body: `Monthly debt payments ${f(m.monthlyDebtPayments)} against ${f(m.avgMonthlyIncome)} income. Consider prepayment scenarios.`,
      link: "/wealth/debt",
      priority: 2,
    });
  }
  for (const g of ctx.goals.filter((x) => x.status === "ACTIVE" && x.progress.onTrack === false).slice(0, 2)) {
    out.push({
      id: `goal-${g.id}`,
      tone: "warn",
      title: `“${g.name}” is behind schedule`,
      body: g.progress.required != null ? `Needs ${f(g.progress.required)}/month to finish by ${formatDate(g.targetDate, ctx.fmt)}; currently planned ${f(g.monthlyContribution)}.` : "Review the target date or contribution.",
      link: "/goals",
      priority: 3,
    });
  }
  if (ctx.unconverted.length) {
    out.push({
      id: "fx-missing",
      tone: "warn",
      title: `${ctx.unconverted.length} foreign-currency transaction(s) excluded from totals`,
      body: "Add exchange rates in Settings → Currency to include them.",
      link: "/settings#currency",
      priority: 1,
    });
  }
  return out.sort((a, b) => a.priority - b.priority);
}
