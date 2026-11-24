import { Suspense } from "react";
import { pageCtx, rangeFrom, type SP } from "@/lib/server/page";
import { keyMetrics } from "@/lib/server/data";
import { buildReport } from "@/lib/server/reports";
import { cashFlowStatement } from "@/lib/finance/ledger";
import { cashForecast } from "@/lib/finance/forecast";
import { endOfMonth, monthLabel, monthsInRange } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/format";
import { LinkButton, PageHeader, Stat } from "@/components/ui/core";
import { ChartFrame, ColumnChart, TrendChart } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";
import { ReportView } from "@/components/report-view";

export const metadata = { title: "Cash flow" };

export default async function CashFlowPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const { range } = rangeFrom(sp, ctx, "last_6_months");
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const base = ctx.accounts.filter((a) => a.currency === ctx.prefs.baseCurrency);
  const cf = cashFlowStatement(base, ctx.txs, range);
  const monthly = monthsInRange(range).map((m) => {
    const s = cashFlowStatement(base, ctx.txs, { from: `${m}-01`, to: endOfMonth(`${m}-01`) });
    return { x: m, inflow: s.operating.income + s.investing.sales + s.financing.borrowings, outflow: -(s.operating.expenses + s.investing.purchases + s.financing.principalRepaid), net: s.netChange - s.newAccountOpenings };
  });
  const m = keyMetrics(ctx);
  const forecast = cashForecast(ctx.netWorth.liquidAssets, m.avgNetCashFlow, 6, ctx.today);
  const report = await buildReport(ctx, "cash-flow", range);
  return (
    <>
      <PageHeader
        title="Cash flow"
        description="Money in and out of your cash accounts. Moving money between your own accounts never counts."
        actions={
          <>
            <Suspense>
              <RangePicker value={range.preset} from={range.from} to={range.to} />
            </Suspense>
            <LinkButton href="/analytics?tab=cashflow">By activity</LinkButton>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Opening cash" value={f(cf.openingCash)} />
        <Stat label="Net cash flow" value={formatMoney(cf.netChange - cf.newAccountOpenings, ctx.fmt, { sign: true })} />
        <Stat label="Closing cash" value={f(cf.closingCash)} hint={cf.reconciles ? "reconciles to balances ✓" : "check foreign-currency accounts"} />
        <Stat label="Avg monthly net flow" value={formatMoney(m.avgNetCashFlow, ctx.fmt, { sign: true })} hint={m.basis} />
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <ChartFrame title="Inflows vs outflows" legend={[{ label: "In", slot: 0 }, { label: "Out", slot: 1 }]} table={{ columns: ["Month", "In", "Out", "Net"], rows: monthly.map((r) => [monthLabel(r.x), f(r.inflow), f(r.outflow), f(r.net)]) }}>
            <ColumnChart prefs={ctx.fmt} xKey="x" data={monthly} series={[{ key: "inflow", name: "In", slot: 0 }, { key: "outflow", name: "Out", slot: 1 }]} xFormat="month" height={240} />
          </ChartFrame>
        </div>
        <div className="lg:col-span-5">
          <ChartFrame title="Cash outlook (estimate)" subtitle={`Liquid cash + ${f(m.avgNetCashFlow)}/month average`} table={{ columns: ["Month", "Estimated cash"], rows: forecast.map((p) => [monthLabel(p.month), f(p.cash)]) }}>
            <TrendChart prefs={ctx.fmt} xKey="month" data={forecast} series={[{ key: "cash", name: "Estimated cash", slot: 0, dashed: true }]} xFormat="month" height={240} zeroLine />
          </ChartFrame>
        </div>
      </div>
      <ReportView report={report} prefs={ctx.fmt} />
    </>
  );
}
