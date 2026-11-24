import "server-only";
import type { Ctx } from "../data";
import { categoryLabel, accountName, health, keyMetrics } from "../data";
import { buildInsights } from "../insights";
import { loadBudgets } from "../budgets";
import { groupBy, summarize, expenseOf, incomeOf } from "../../finance/ledger";
import { spendingDrivers, detectAnomalies, detectRecurring } from "../../finance/insights";
import { budgetStatus } from "../../finance/budget";
import { amortize, nextEmiDate } from "../../finance/loans";
import { cashForecast } from "../../finance/forecast";
import { isISODate, resolveRange, previousRange } from "../../finance/dates";
import { ASSET_CLASS_LABELS } from "../../finance/investments";
import { formatMoney, formatPct } from "../../format";
import { TX_TYPE_LABELS } from "../../finance/types";

/**
 * Read-only analysis functions over the user's own data. Shared by the built-in
 * analyst and the Claude tool loop. None of these can create or modify records.
 * Amounts are returned pre-formatted in the user's currency to avoid unit errors.
 */
export function rangeArg(ctx: Ctx, input: { period?: string; from?: string; to?: string }) {
  if (input.from && input.to && isISODate(input.from) && isISODate(input.to) && input.from <= input.to) return { from: input.from, to: input.to };
  const r = resolveRange(input.period ?? "this_month", ctx.today, { earliest: ctx.earliestDate, fyStartMonth: ctx.prefs.fyStartMonth });
  return { from: r.from, to: r.to };
}

export const toolImpl = {
  get_overview(ctx: Ctx) {
    const f = (v: number) => formatMoney(v, ctx.fmt);
    const m = keyMetrics(ctx);
    return {
      today: ctx.today,
      net_worth: f(ctx.netWorth.netWorth),
      total_assets: f(ctx.netWorth.totalAssets),
      total_liabilities: f(ctx.netWorth.totalLiabilities),
      by_group: Object.fromEntries(Object.entries(ctx.netWorth.byGroup).map(([k, v]) => [k, f(v)])),
      liquid_cash: f(ctx.netWorth.liquidAssets),
      averages_basis: m.basis,
      avg_monthly_income: f(m.avgMonthlyIncome),
      avg_monthly_expenses: f(m.avgMonthlyExpenses),
      savings_rate: formatPct(m.savingsRate),
      emergency_fund_months: m.emergencyMonths?.toFixed(1) ?? null,
      debt_to_income: formatPct(m.debtToIncome),
      credit_utilization: formatPct(m.creditUtilization),
      accounts: ctx.accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ name: a.name, type: a.type, balance: formatMoney(ctx.balances.get(a.id) ?? 0, { ...ctx.fmt, currency: a.currency }) })),
      warnings: ctx.netWorth.warnings,
    };
  },
  get_period_summary(ctx: Ctx, input: { period?: string; from?: string; to?: string }) {
    const r = rangeArg(ctx, input);
    const f = (v: number) => formatMoney(v, ctx.fmt);
    const s = summarize(ctx.txs, r);
    return {
      from: r.from,
      to: r.to,
      income: f(s.income),
      expenses: f(s.expenses),
      savings: f(s.savings),
      savings_rate: formatPct(s.savingsRate),
      top_expense_categories: groupBy(ctx.txs, r, "topCategory", "expense", ctx.catIdx).slice(0, 8).map((g) => ({ category: categoryLabel(ctx, g.key), amount: f(g.amount), count: g.count })),
      top_merchants: groupBy(ctx.txs, r, "merchant", "expense").slice(0, 8).map((g) => ({ merchant: g.key, amount: f(g.amount), count: g.count })),
      income_sources: groupBy(ctx.txs, r, "topCategory", "income", ctx.catIdx).slice(0, 6).map((g) => ({ source: categoryLabel(ctx, g.key), amount: f(g.amount) })),
    };
  },
  compare_periods(ctx: Ctx, input: { period?: string; from?: string; to?: string }) {
    const cur = rangeArg(ctx, input);
    const prev = previousRange(cur);
    const f = (v: number) => formatMoney(v, ctx.fmt);
    const a = summarize(ctx.txs, cur);
    const b = summarize(ctx.txs, prev);
    return {
      current: { ...cur, income: f(a.income), expenses: f(a.expenses), savings: f(a.savings) },
      previous: { ...prev, income: f(b.income), expenses: f(b.expenses), savings: f(b.savings) },
      expense_change_pct: b.expenses ? formatPct(((a.expenses - b.expenses) / b.expenses) * 100) : null,
      biggest_category_changes: spendingDrivers(ctx.txs, cur, prev, ctx.catIdx)
        .slice(0, 6)
        .map((d) => ({ category: categoryLabel(ctx, d.categoryId), current: f(d.current), previous: f(d.previous), change: formatMoney(d.delta, ctx.fmt, { sign: true }) })),
    };
  },
  search_transactions(ctx: Ctx, input: { text?: string; period?: string; from?: string; to?: string; type?: string; min_amount?: number; limit?: number }) {
    const r = rangeArg(ctx, { period: input.period ?? "all", from: input.from, to: input.to });
    const q = input.text?.toLowerCase().trim();
    const rows = ctx.txs
      .filter((t) => t.date >= r.from && t.date <= r.to)
      .filter((t) => !input.type || t.type === input.type)
      .filter((t) => !input.min_amount || Math.abs(t.amount) >= Math.round(input.min_amount * 100))
      .filter((t) => !q || [t.merchant, t.description, categoryLabel(ctx, t.categoryId)].some((x) => x?.toLowerCase().includes(q)));
    return {
      from: r.from,
      to: r.to,
      matched: rows.length,
      total_spent: formatMoney(rows.reduce((s, t) => s + expenseOf(t), 0), ctx.fmt),
      total_received: formatMoney(rows.reduce((s, t) => s + incomeOf(t), 0), ctx.fmt),
      transactions: rows.slice(0, Math.min(50, input.limit ?? 20)).map((t) => ({
        date: t.date,
        type: TX_TYPE_LABELS[t.type],
        amount: formatMoney(t.amount, ctx.fmt),
        merchant: t.merchant,
        description: t.description,
        category: categoryLabel(ctx, t.categoryId),
        account: accountName(ctx, t.accountId),
      })),
    };
  },
  async get_budgets(ctx: Ctx) {
    const f = (v: number) => formatMoney(v, ctx.fmt);
    const budgets = (await loadBudgets(ctx.userId)).filter((b) => b.active);
    return budgets.map((b) => {
      const s = budgetStatus(b, ctx.txs, ctx.categories, ctx.today);
      return {
        name: b.name,
        period: `${s.window.from} → ${s.window.to}`,
        days_left: s.daysLeft,
        planned: f(s.available),
        spent: f(s.actual),
        projected: f(s.projected),
        lines: s.lines.map((l) => ({ category: categoryLabel(ctx, l.categoryId), planned: f(l.available), spent: f(l.actual), used: formatPct(l.utilization, 0), projected: f(l.projected) })),
      };
    });
  },
  get_goals(ctx: Ctx) {
    const f = (v: number) => formatMoney(v, ctx.fmt);
    return ctx.goals.map((g) => ({
      name: g.name,
      status: g.status,
      current: f(g.current),
      target: f(g.targetAmount),
      progress: formatPct(g.progress.pct),
      target_date: g.targetDate,
      monthly_contribution: f(g.monthlyContribution),
      required_monthly: g.progress.required != null ? f(g.progress.required) : null,
      projected_completion: g.progress.projectedDate,
      on_track: g.progress.onTrack,
      return_assumption_pct: g.expectedReturn,
    }));
  },
  get_investments(ctx: Ctx) {
    const f = (v: number) => formatMoney(v, ctx.fmt);
    const pf = ctx.portfolio;
    return {
      market_value: f(pf.marketValue),
      invested_cost: f(pf.invested),
      unrealized: f(pf.unrealized),
      realized: f(pf.realized),
      dividends_interest: f(pf.dividends),
      xirr: formatPct(pf.xirr),
      absolute_return: formatPct(pf.absoluteReturnPct),
      allocation: pf.allocation.map((a) => ({ class: ASSET_CLASS_LABELS[a.assetClass], value: f(a.value), share: formatPct(a.pct) })),
      holdings: pf.positions
        .filter((p) => p.marketValue > 0)
        .map((p) => ({ name: p.holding.name, value: f(p.marketValue), unrealized: f(p.unrealized), xirr: formatPct(p.xirr), price_source: p.holding.priceSource, price_date: p.holding.priceDate, priced: p.priced })),
      note: "Prices are manually entered (or demo/fictional where price_source is DEMO); never live market data unless a provider is configured.",
    };
  },
  get_debts(ctx: Ctx) {
    const f = (v: number) => formatMoney(v, ctx.fmt);
    return {
      total_liabilities: f(ctx.netWorth.totalLiabilities),
      loans: ctx.loans.map((l) => {
        const s = amortize(l.outstanding, Number(l.interestRate), l.emi, nextEmiDate(ctx.today, l.emiDay));
        return { name: l.name, outstanding: f(l.outstanding), rate_pct: l.interestRate, emi: f(l.emi), months_left: s.months, payoff_date: s.payoffDate, interest_remaining: f(s.totalInterest) };
      }),
      credit_cards: ctx.accounts.filter((a) => a.type === "CREDIT_CARD").map((a) => ({ name: a.name, outstanding: f(Math.max(0, -(ctx.balances.get(a.id) ?? 0))), limit: a.creditLimit != null ? f(a.creditLimit) : null })),
      other: ctx.liabilities.map((l) => ({ name: l.name, outstanding: f(l.outstanding) })),
    };
  },
  get_cash_forecast(ctx: Ctx, input: { months?: number }) {
    const months = Math.min(24, Math.max(1, Math.round(input.months ?? 6)));
    const m = keyMetrics(ctx);
    return {
      method: "ESTIMATE: today's liquid cash + trailing average monthly net cash flow × months. Includes recurring EMIs/investing as they occurred historically.",
      basis: m.basis,
      starting_liquid_cash: formatMoney(ctx.netWorth.liquidAssets, ctx.fmt),
      avg_monthly_net_cash_flow: formatMoney(m.avgNetCashFlow, ctx.fmt),
      projection: cashForecast(ctx.netWorth.liquidAssets, m.avgNetCashFlow, months, ctx.today).map((p) => ({ month: p.month, estimated_cash: formatMoney(p.cash, ctx.fmt) })),
    };
  },
  get_health_and_insights: async (ctx: Ctx) => {
    const h = health(ctx);
    return {
      score: h.result.score,
      band: h.result.band,
      note: "Rules-based indicator, not a credit score.",
      components: h.result.components.map((c) => ({ name: c.label, score: c.score, value: c.display, rule: c.rule })),
      insights: (await buildInsights(ctx)).slice(0, 8).map((i) => ({ title: i.title, detail: i.body })),
      unusual_transactions: detectAnomalies(ctx.txs, ctx.today, ctx.prefs.largeExpenseThreshold, 30).slice(0, 5).map((a) => ({ date: a.tx.date, amount: formatMoney(a.tx.amount, ctx.fmt), merchant: a.tx.merchant, reason: a.reason })),
      possible_subscriptions: detectRecurring(ctx.txs, new Set(ctx.rules.map((r) => (r.merchant ?? r.name).toLowerCase()))).slice(0, 5).map((c) => ({ merchant: c.merchant, amount: formatMoney(c.averageAmount, ctx.fmt), occurrences: c.occurrences })),
    };
  },
};

export type ToolName = keyof typeof toolImpl;
