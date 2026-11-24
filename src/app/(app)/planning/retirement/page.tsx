import { pageCtx } from "@/lib/server/page";
import { keyMetrics } from "@/lib/server/data";
import { monthlyEquivalent } from "@/lib/finance/recurring";
import { PageHeader } from "@/components/ui/core";
import { RetirementPlanner } from "./planner";

export const metadata = { title: "Retirement planning" };

export default async function RetirementPage() {
  const ctx = await pageCtx();
  const m = keyMetrics(ctx);
  const retirementClasses = ["PPF", "EPF", "NPS", "MUTUAL_FUND", "INDEX_FUND", "ETF", "STOCK"];
  const corpus = ctx.portfolio.positions.filter((p) => retirementClasses.includes(p.holding.assetClass)).reduce((s, p) => s + p.marketValue, 0);
  // Monthly investment: average investment purchases over the last 3 complete months
  const since = new Date(Date.parse(ctx.today) - 92 * 86400000).toISOString().slice(0, 10);
  const sipFromLedger = Math.round(ctx.txs.filter((t) => t.type === "INVESTMENT_BUY" && t.date >= since).reduce((s, t) => s + t.amount, 0) / 3);
  const sipFromRules = ctx.rules.filter((r) => r.active && r.kind === "INVESTMENT").reduce((s, r) => s + monthlyEquivalent(r.amount, r), 0);
  return (
    <>
      <PageHeader title="Retirement planning" description="How large a corpus you need, whether your current plan gets there, and the monthly investment that would." />
      <RetirementPlanner prefs={ctx.fmt} defaults={{ monthlyExpenses: m.avgMonthlyExpenses, corpus, sip: Math.max(sipFromLedger, sipFromRules) }} />
    </>
  );
}
