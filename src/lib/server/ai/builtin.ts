import "server-only";
import type { Ctx } from "../data";
import { toolImpl } from "./tools";
import { formatDate } from "../../format";

/**
 * Built-in analyst: deterministic intent matching over the same read-only functions
 * the Claude tool loop uses. Every number comes from stored records; estimates are
 * labelled as such. Answers use light markdown (**bold**, "- " bullets).
 */

function period(q: string): { period: string; label: string } {
  if (/last month|previous month/.test(q)) return { period: "last_month", label: "last month" };
  if (/this week/.test(q)) return { period: "this_week", label: "this week" };
  if (/last year/.test(q)) return { period: "last_year", label: "last year" };
  if (/this year|year to date|ytd/.test(q)) return { period: "this_year", label: "this year" };
  if (/financial year|\bfy\b/.test(q)) return { period: "this_fy", label: "this financial year" };
  if (/(3|three) months|quarter/.test(q)) return { period: "last_3_months", label: "the last 3 months" };
  if (/(6|six) months/.test(q)) return { period: "last_6_months", label: "the last 6 months" };
  if (/all time|ever|overall/.test(q)) return { period: "all", label: "all time" };
  return { period: "this_month", label: "this month" };
}

export async function builtinAnswer(ctx: Ctx, question: string): Promise<string> {
  const q = question.toLowerCase();
  const p = period(q);

  if (!ctx.accounts.length) return "You don't have any accounts yet, so there's nothing to analyse. Add an account (or load demo data in Settings → Data) and ask again.";

  if (/net ?worth|how much (am i|i'm) worth|total assets|liabilit/.test(q)) {
    const o = toolImpl.get_overview(ctx);
    return [
      `Your **net worth is ${o.net_worth}** as of ${formatDate(o.today, ctx.fmt)}.`,
      `- Assets: ${o.total_assets} (cash & bank ${o.by_group.CASH_BANK}, investments ${o.by_group.INVESTMENTS}, other assets ${o.by_group.OTHER_ASSETS})`,
      `- Liabilities: ${o.total_liabilities} (loans ${o.by_group.LOANS}, cards ${o.by_group.CREDIT_CARDS})`,
      ...o.warnings.map((w) => `- ⚠ ${w}`),
      "",
      "_Basis: account balances from your ledger, holdings at their latest entered prices, and recorded asset values._",
    ].join("\n");
  }

  if (/why|increase|went up|higher|jump|compare|vs|versus|difference/.test(q) && /spend|expense|cost/.test(q)) {
    const c = toolImpl.compare_periods(ctx, { period: p.period });
    return [
      `Spending for ${p.label} (${formatDate(c.current.from, ctx.fmt)} → ${formatDate(c.current.to, ctx.fmt)}) was **${c.current.expenses}** versus **${c.previous.expenses}** in the previous equal period${c.expense_change_pct ? ` (${c.expense_change_pct})` : ""}.`,
      "",
      "Biggest category changes:",
      ...c.biggest_category_changes.slice(0, 5).map((d) => `- ${d.category}: ${d.change} (${d.previous} → ${d.current})`),
      "",
      p.period === "this_month" ? "_Note: the current month is still in progress, so the comparison covers a partial month against a full one._" : "_Basis: net spending (expenses − refunds + loan interest) from your transactions._",
    ].join("\n");
  }

  if (/biggest|largest|top|most/.test(q) && /expense|spend|categor|merchant|where/.test(q)) {
    const s = toolImpl.get_period_summary(ctx, { period: p.period });
    return [
      `Your largest expenses for ${p.label} (total **${s.expenses}**):`,
      ...s.top_expense_categories.slice(0, 6).map((c, i) => `${i + 1}. ${c.category} — ${c.amount} (${c.count} transactions)`),
      "",
      "Top merchants:",
      ...s.top_merchants.slice(0, 5).map((m) => `- ${m.merchant} — ${m.amount}`),
    ].join("\n");
  }

  if (/spen[dt]|expense|cost me/.test(q)) {
    const s = toolImpl.get_period_summary(ctx, { period: p.period });
    return [
      `You spent **${s.expenses}** ${p.label} (${formatDate(s.from, ctx.fmt)} → ${formatDate(s.to, ctx.fmt)}).`,
      s.top_expense_categories.length ? `Biggest categories: ${s.top_expense_categories.slice(0, 3).map((c) => `${c.category} ${c.amount}`).join(", ")}.` : "",
      `Income in the same period was ${s.income}, leaving savings of ${s.savings} (${s.savings_rate}).`,
      "",
      "_Spending excludes transfers between your accounts, investment purchases and loan principal; refunds are netted off._",
    ].join("\n");
  }

  if (/sav(e|ed|ing)|savings rate/.test(q)) {
    const s = toolImpl.get_period_summary(ctx, { period: p.period === "this_month" && /year/.test(q) ? "this_year" : p.period });
    const o = toolImpl.get_overview(ctx);
    return [
      `For ${formatDate(s.from, ctx.fmt)} → ${formatDate(s.to, ctx.fmt)} you saved **${s.savings}** of ${s.income} income — a savings rate of **${s.savings_rate}**.`,
      `Over the ${o.averages_basis}, your average savings rate is ${o.savings_rate} (income ${o.avg_monthly_income}/month, expenses ${o.avg_monthly_expenses}/month).`,
    ].join("\n");
  }

  if (/earn|income|salary|made/.test(q)) {
    const s = toolImpl.get_period_summary(ctx, { period: p.period });
    return [`Your income ${p.label} was **${s.income}**.`, ...s.income_sources.map((i) => `- ${i.source}: ${i.amount}`)].join("\n");
  }

  if (/invest|portfolio|return|xirr|stock|mutual fund|sip/.test(q)) {
    const i = toolImpl.get_investments(ctx);
    if (!i.holdings.length) return "You have no investment holdings recorded yet. Add them under Investments to track returns.";
    return [
      `Your portfolio is worth **${i.market_value}** against a cost of ${i.invested_cost}.`,
      `- Unrealized gain/loss: ${i.unrealized} · Realized: ${i.realized} · Dividends & interest: ${i.dividends_interest}`,
      `- Annualised return (XIRR): **${i.xirr}** · Absolute return: ${i.absolute_return}`,
      `- Allocation: ${i.allocation.map((a) => `${a.class} ${a.share}`).join(", ")}`,
      "",
      `_${i.note}_`,
    ].join("\n");
  }

  if (/goal|target|when will i (reach|hit|have)/.test(q)) {
    const goals = toolImpl.get_goals(ctx).filter((g) => g.status === "ACTIVE");
    if (!goals.length) return "You don't have any active goals. Create one under Planning → Financial goals.";
    return [
      "Your goals:",
      ...goals.map(
        (g) =>
          `- **${g.name}**: ${g.current} of ${g.target} (${g.progress}). ${g.projected_completion ? `Projected completion ${formatDate(g.projected_completion, ctx.fmt)}` : "Add a monthly contribution to project completion"}${g.target_date ? `; target ${formatDate(g.target_date, ctx.fmt)}${g.on_track === false ? ` — behind, needs ${g.required_monthly}/month` : g.on_track ? " — on track" : ""}` : ""}.`,
      ),
      "",
      "_Projections are estimates assuming your planned monthly contribution continues (plus any return assumption you set)._",
    ].join("\n");
  }

  if (/cash|balance|forecast|run out|months? from now|future|next \d+ months|six months|6 months/.test(q)) {
    const months = Number(q.match(/(\d+)\s*months?/)?.[1] ?? (/six/.test(q) ? 6 : 6));
    const fc = toolImpl.get_cash_forecast(ctx, { months });
    const last = fc.projection.at(-1);
    return [
      `**Estimate:** liquid cash of about **${last?.estimated_cash}** by ${last?.month}.`,
      `- Starting point: ${fc.starting_liquid_cash} in liquid accounts today`,
      `- Assumption: your average net cash flow of ${fc.avg_monthly_net_cash_flow}/month (${fc.basis}) continues`,
      "",
      "_This is a projection, not a fact. Use Planning → Scenario simulator to test different assumptions._",
    ].join("\n");
  }

  if (/debt|loan|emi|owe|credit card/.test(q)) {
    const d = toolImpl.get_debts(ctx);
    return [
      `Total debt: **${d.total_liabilities}**.`,
      ...d.loans.map((l) => `- ${l.name}: ${l.outstanding} at ${l.rate_pct}%, EMI ${l.emi}, ${l.months_left} months left (payoff ${formatDate(l.payoff_date, ctx.fmt)}), ${l.interest_remaining} interest remaining`),
      ...d.credit_cards.filter((c) => c.outstanding).map((c) => `- ${c.name}: ${c.outstanding} outstanding${c.limit ? ` of ${c.limit} limit` : ""}`),
      ...d.other.map((o) => `- ${o.name}: ${o.outstanding}`),
    ].join("\n");
  }

  if (/budget|overspend|limit/.test(q)) {
    const b = await toolImpl.get_budgets(ctx);
    if (!b.length) return "You don't have an active budget. Plan one under Budgeting → Budget planning.";
    return b
      .map((x) =>
        [
          `**${x.name}** (${x.period}, ${x.days_left} days left): spent ${x.spent} of ${x.planned}; projected ${x.projected} at the current pace.`,
          ...x.lines.filter((l) => parseFloat(l.used) >= 75).map((l) => `- ⚠ ${l.category}: ${l.used} used (${l.spent} of ${l.planned})`),
        ].join("\n"),
      )
      .join("\n\n");
  }

  if (/health|score|how am i doing|doing financially|unusual|anomal|recommend|advice|improve|tip/.test(q)) {
    const h = await toolImpl.get_health_and_insights(ctx);
    return [
      h.score != null ? `Your financial health score is **${h.score}/100 (${h.band})** — ${h.note}` : "There isn't enough data for a health score yet.",
      "",
      ...h.components.filter((c) => c.score != null).map((c) => `- ${c.name}: ${c.value} → ${c.score}/100`),
      "",
      h.insights.length ? "What stands out:" : "",
      ...h.insights.slice(0, 5).map((i) => `- **${i.title}** — ${i.detail}`),
      ...(h.unusual_transactions.length ? ["", "Unusual transactions:", ...h.unusual_transactions.map((u) => `- ${formatDate(u.date, ctx.fmt)}: ${u.amount} at ${u.merchant ?? "unknown"} — ${u.reason}`)] : []),
    ].join("\n");
  }

  const tx = toolImpl.search_transactions(ctx, { text: question.replace(/[?.!]/g, "").split(/\s+/).filter((w) => w.length > 3).slice(-1)[0], period: "all", limit: 5 });
  if (tx.matched > 0 && tx.matched < 500)
    return [`I found ${tx.matched} transaction(s) matching your question (spent ${tx.total_spent}, received ${tx.total_received}). Most recent:`, ...tx.transactions.map((t) => `- ${formatDate(t.date, ctx.fmt)} · ${t.merchant ?? t.description ?? t.category} · ${t.amount} (${t.type})`)].join("\n");

  return [
    "I can answer questions about your recorded finances. Try:",
    "- What is my net worth?",
    "- How much did I spend this month?",
    "- What are my biggest expenses this year?",
    "- Why did my spending increase last month?",
    "- What is my savings rate?",
    "- How are my investments performing?",
    "- When will I reach my goals?",
    "- What will my cash balance look like in six months?",
    "- How much debt remains?",
    "- How healthy are my finances?",
  ].join("\n");
}
