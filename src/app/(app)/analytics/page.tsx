import { Suspense } from "react";
import { pageCtx, param, rangeFrom, type SP } from "@/lib/server/page";
import { cashFlowStatement, monthlySeries, summarize } from "@/lib/finance/ledger";
import { endOfMonth, MONTHS_SHORT, monthLabel, monthsInRange } from "@/lib/finance/dates";
import { formatMoney, formatPct } from "@/lib/format";
import { Card, CardHeader, Delta, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/core";
import { ChartFrame, ColumnChart, TrendChart } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const tab = param(sp, "tab") ?? "overview";
  const { range, prev } = rangeFrom(sp, ctx, "last_6_months");
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const cur = summarize(ctx.txs, range);
  const before = summarize(ctx.txs, prev);
  const base = ctx.accounts.filter((a) => a.currency === ctx.prefs.baseCurrency);
  const cfNow = cashFlowStatement(base, ctx.txs, range);
  const cfPrev = cashFlowStatement(base, ctx.txs, prev);
  const series = monthlySeries(ctx.txs, range);
  const q = range.preset === "custom" ? `&range=custom&from=${range.from}&to=${range.to}` : `&range=${range.preset}`;

  const chg = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
  const thisYear = ctx.today.slice(0, 4);
  const lastYear = String(Number(thisYear) - 1);
  const ty = monthlySeries(ctx.txs, { from: `${thisYear}-01-01`, to: `${thisYear}-12-31` });
  const ly = monthlySeries(ctx.txs, { from: `${lastYear}-01-01`, to: `${lastYear}-12-31` });
  const yoy = MONTHS_SHORT.map((m, i) => ({ x: m, thisYear: ty[i]?.expenses ?? 0, lastYear: ly[i]?.expenses ?? 0 }));

  const cfMonthly = monthsInRange(range).map((m) => {
    const s = cashFlowStatement(base, ctx.txs, { from: `${m}-01`, to: endOfMonth(`${m}-01`) });
    return { x: m, operating: s.operating.net, investing: s.investing.net, financing: s.financing.net, net: s.netChange - s.newAccountOpenings };
  });

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Trends and period comparisons across income, spending, savings and cash flow."
        actions={
          <Suspense>
            <RangePicker value={range.preset} from={range.from} to={range.to} />
          </Suspense>
        }
      />
      <Tabs
        active={tab}
        items={[
          { id: "overview", label: "Overview", href: `/analytics?tab=overview${q}` },
          { id: "savings", label: "Savings", href: `/analytics?tab=savings${q}` },
          { id: "cashflow", label: "Cash flow", href: `/analytics?tab=cashflow${q}` },
          { id: "income", label: "Income →", href: `/income?${q.slice(1)}` },
          { id: "expenses", label: "Expenses →", href: `/expenses?${q.slice(1)}` },
          { id: "investments", label: "Investments →", href: "/investments/analytics" },
          { id: "networth", label: "Net worth →", href: "/wealth/history" },
        ]}
      />
      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader title="Period comparison" subtitle={`${range.from} → ${range.to} vs ${prev.from} → ${prev.to}`} />
            <Table>
              <thead>
                <tr>
                  <Th>Metric</Th>
                  <Th align="right">This period</Th>
                  <Th align="right">Previous</Th>
                  <Th align="right">Change</Th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Income", cur.income, before.income, true],
                  ["Expenses", cur.expenses, before.expenses, false],
                  ["Savings", cur.savings, before.savings, true],
                  ["Net cash flow", cfNow.netChange - cfNow.newAccountOpenings, cfPrev.netChange - cfPrev.newAccountOpenings, true],
                  ["Invested (net)", -cfNow.investing.net, -cfPrev.investing.net, true],
                  ["Loan principal repaid", cfNow.financing.principalRepaid, cfPrev.financing.principalRepaid, true],
                ].map(([l, a, b, up]) => (
                  <tr key={l as string}>
                    <Td>{l as string}</Td>
                    <Td align="right">{f(a as number)}</Td>
                    <Td align="right" className="text-fg-2">{f(b as number)}</Td>
                    <Td align="right">
                      <Delta value={chg(a as number, b as number)} goodWhenUp={up as boolean} />
                    </Td>
                  </tr>
                ))}
                <tr>
                  <Td>Savings rate</Td>
                  <Td align="right">{formatPct(cur.savingsRate)}</Td>
                  <Td align="right" className="text-fg-2">{formatPct(before.savingsRate)}</Td>
                  <Td align="right">
                    <Delta value={cur.savingsRate != null && before.savingsRate != null ? cur.savingsRate - before.savingsRate : null} suffix=" pp" />
                  </Td>
                </tr>
              </tbody>
            </Table>
          </Card>
          <div className="lg:col-span-7">
            <ChartFrame
              title="Income vs expenses"
              legend={[{ label: "Income", slot: 0 }, { label: "Expenses", slot: 1 }]}
              table={{ columns: ["Month", "Income", "Expenses", "Savings"], rows: series.map((m) => [monthLabel(m.month), f(m.income), f(m.expenses), f(m.savings)]) }}
            >
              <ColumnChart prefs={ctx.fmt} xKey="month" data={series} series={[{ key: "income", name: "Income", slot: 0 }, { key: "expenses", name: "Expenses", slot: 1 }]} xFormat="month" height={260} />
            </ChartFrame>
          </div>
          <div className="lg:col-span-12">
            <ChartFrame
              title={`Spending: ${thisYear} vs ${lastYear}`}
              subtitle="Month-by-month comparison"
              legend={[{ label: thisYear, slot: 1 }, { label: lastYear, slot: 0, dashed: true }]}
              table={{ columns: ["Month", thisYear, lastYear], rows: yoy.map((r) => [r.x, f(r.thisYear), f(r.lastYear)]) }}
            >
              <TrendChart prefs={ctx.fmt} xKey="x" data={yoy} series={[{ key: "thisYear", name: thisYear, slot: 1, type: "line" }, { key: "lastYear", name: lastYear, slot: 0, dashed: true }]} height={240} />
            </ChartFrame>
          </div>
        </div>
      )}
      {tab === "savings" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartFrame title="Monthly savings" table={{ columns: ["Month", "Savings"], rows: series.map((m) => [monthLabel(m.month), f(m.savings)]) }}>
            <ColumnChart prefs={ctx.fmt} xKey="month" data={series} series={[{ key: "savings", name: "Savings", slot: 2 }]} xFormat="month" height={260} />
          </ChartFrame>
          <ChartFrame title="Savings rate" subtitle="Savings ÷ income" table={{ columns: ["Month", "Rate"], rows: series.map((m) => [monthLabel(m.month), formatPct(m.income ? (m.savings / m.income) * 100 : null)]) }}>
            <TrendChart prefs={ctx.fmt} xKey="month" data={series.map((m) => ({ month: m.month, rate: m.income ? Math.round((m.savings / m.income) * 1000) / 10 : null }))} series={[{ key: "rate", name: "Savings rate", slot: 2, type: "line" }]} xFormat="month" valueFormat="percent" height={260} zeroLine />
          </ChartFrame>
          <Card className="lg:col-span-2">
            <CardHeader title="Savings summary" />
            <div className="grid grid-cols-2 gap-4 px-5 pb-5 text-[13px] md:grid-cols-4">
              <div>
                <p className="text-muted">Total saved</p>
                <p className="num text-[18px] font-semibold">{f(cur.savings)}</p>
              </div>
              <div>
                <p className="text-muted">Average / month</p>
                <p className="num text-[18px] font-semibold">{f(Math.round(cur.savings / Math.max(1, series.length)))}</p>
              </div>
              <div>
                <p className="text-muted">Best month</p>
                <p className="num text-[18px] font-semibold">{series.length ? monthLabel([...series].sort((a, b) => b.savings - a.savings)[0].month) : "—"}</p>
              </div>
              <div>
                <p className="text-muted">Months with positive savings</p>
                <p className="num text-[18px] font-semibold">
                  {series.filter((m) => m.savings > 0).length} / {series.length}
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
      {tab === "cashflow" && (
        <div className="grid gap-4">
          <ChartFrame
            title="Cash flow by activity"
            subtitle="Operating = income − expenses · Investing = sales − purchases · Financing = borrowing − principal repaid"
            legend={[{ label: "Operating", slot: 0 }, { label: "Investing", slot: 2 }, { label: "Financing", slot: 1 }]}
            table={{ columns: ["Month", "Operating", "Investing", "Financing", "Net"], rows: cfMonthly.map((m) => [monthLabel(m.x), f(m.operating), f(m.investing), f(m.financing), f(m.net)]) }}
          >
            <ColumnChart prefs={ctx.fmt} xKey="x" data={cfMonthly} series={[{ key: "operating", name: "Operating", slot: 0 }, { key: "investing", name: "Investing", slot: 2 }, { key: "financing", name: "Financing", slot: 1 }]} xFormat="month" height={280} />
          </ChartFrame>
          <p className="text-[12px] text-muted">Full statement with opening/closing reconciliation: Financial statements → Cash-flow statement.</p>
        </div>
      )}
    </>
  );
}
