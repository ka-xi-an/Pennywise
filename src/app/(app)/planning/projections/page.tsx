import { pageCtx } from "@/lib/server/page";
import { keyMetrics } from "@/lib/server/data";
import { simBase } from "@/lib/server/sim-base";
import { cashForecast, simulate } from "@/lib/finance/forecast";
import { occurrencesBetween } from "@/lib/finance/recurring";
import { addMonths, endOfMonth, monthLabel, startOfMonth } from "@/lib/finance/dates";
import { formatDate, formatMoney } from "@/lib/format";
import { Card, CardHeader, LinkButton, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ChartFrame, TrendChart } from "@/components/charts";

export const metadata = { title: "Financial projections" };

export default async function ProjectionsPage() {
  const ctx = await pageCtx();
  const m = keyMetrics(ctx);
  const { params, basis } = simBase(ctx);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const path = simulate(params, ctx.today);
  const cash = cashForecast(ctx.netWorth.liquidAssets, m.avgNetCashFlow, 12, ctx.today);
  // Known scheduled items over the next 6 months (facts from your schedules)
  const scheduled = Array.from({ length: 6 }, (_, i) => {
    const from = startOfMonth(addMonths(ctx.today, i + 1));
    const to = endOfMonth(from);
    let inflow = 0,
      outflow = 0;
    for (const r of ctx.rules.filter((x) => x.active)) {
      const n = occurrencesBetween(r, from, to).length;
      if (r.txType === "INCOME") inflow += n * r.amount;
      else if (r.txType !== "TRANSFER") outflow += n * r.amount;
    }
    return { month: from.slice(0, 7), inflow, outflow };
  });
  const at = (months: number) => path[Math.min(path.length, months) - 1];

  return (
    <>
      <PageHeader title="Financial projections" description="Where your current trends lead if nothing changes. Built from recorded averages plus clearly stated assumptions." actions={<LinkButton href="/planning/simulator" variant="primary">Try scenarios</LinkButton>} />
      <Notice tone="ai" className="mb-4" title="Estimates, not facts">
        Based on your {basis}: income {f(params.monthlyIncome)}/mo, expenses {f(params.monthlyExpenses)}/mo (excl. loan interest), investing {f(params.monthlyInvestment)}/mo. Assumptions: {params.annualReturnPct}% investment return, {params.annualIncomeGrowthPct}% annual income growth, {params.inflationPct}% expense inflation, loans paid as scheduled.
      </Notice>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[12, 36, 60].map((mo) => (
          <Stat key={mo} label={`Net worth in ${mo / 12} yr${mo > 12 ? "s" : ""}`} value={f(at(mo).netWorth)} hint={`today ${f(ctx.netWorth.netWorth)}`} />
        ))}
        <Stat label="Debt in 5 years" value={f(at(60).debt)} hint={`today ${f(ctx.netWorth.totalLiabilities)}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ChartFrame
            title="5-year projection"
            subtitle="Estimate"
            legend={[{ label: "Net worth", slot: 0 }, { label: "Investments", slot: 2 }, { label: "Debt", slot: 1 }]}
            table={{ columns: ["Month", "Cash", "Investments", "Debt", "Net worth"], rows: path.filter((_, i) => i % 6 === 5).map((p) => [monthLabel(p.month), f(p.cash), f(p.investments), f(p.debt), f(p.netWorth)]) }}
          >
            <TrendChart
              prefs={ctx.fmt}
              xKey="month"
              data={path.map((p) => ({ month: p.month, netWorth: p.netWorth, investments: p.investments, debt: p.debt }))}
              series={[
                { key: "netWorth", name: "Net worth", slot: 0, dashed: true },
                { key: "investments", name: "Investments", slot: 2, dashed: true },
                { key: "debt", name: "Debt", slot: 1, dashed: true },
              ]}
              xFormat="month"
              height={280}
            />
          </ChartFrame>
        </div>
        <div className="lg:col-span-4">
          <ChartFrame title="Cash balance, next 12 months" subtitle={`Estimate: liquid cash + ${f(m.avgNetCashFlow)}/mo average net cash flow`} table={{ columns: ["Month", "Cash"], rows: cash.map((c) => [monthLabel(c.month), f(c.cash)]) }}>
            <TrendChart prefs={ctx.fmt} xKey="month" data={cash} series={[{ key: "cash", name: "Projected cash", slot: 0, dashed: true }]} xFormat="month" height={280} zeroLine />
          </ChartFrame>
        </div>
        <Card className="lg:col-span-6">
          <CardHeader title="Scheduled cash flows" subtitle="From your recurring schedules (facts, not estimates)" />
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Scheduled in</Th>
                <Th align="right">Scheduled out</Th>
                <Th align="right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((s) => (
                <tr key={s.month}>
                  <Td>{monthLabel(s.month)}</Td>
                  <Td align="right" className="text-pos">{f(s.inflow)}</Td>
                  <Td align="right">{f(s.outflow)}</Td>
                  <Td align="right" className={s.inflow - s.outflow < 0 ? "text-neg" : ""}>{f(s.inflow - s.outflow)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="lg:col-span-6">
          <CardHeader title="Goal outlook" subtitle="At planned monthly contributions" />
          <Table>
            <tbody>
              {ctx.goals
                .filter((g) => g.status === "ACTIVE")
                .map((g) => (
                  <tr key={g.id}>
                    <Td className="font-medium">{g.name}</Td>
                    <Td align="right">{g.progress.projectedDate ? formatDate(g.progress.projectedDate, ctx.fmt) : g.progress.remaining === 0 ? "Reached" : "No contribution set"}</Td>
                    <Td align="right" className={g.progress.onTrack === false ? "text-neg" : "text-fg-2"}>
                      {g.targetDate ? `target ${formatDate(g.targetDate, ctx.fmt)}` : "no target date"}
                    </Td>
                  </tr>
                ))}
              {!ctx.goals.length && (
                <tr>
                  <Td className="py-6 text-center text-muted">No goals.</Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
