import Link from "next/link";
import { Suspense } from "react";
import { pageCtx, rangeFrom, type SP } from "@/lib/server/page";
import { accountName, categoryColor } from "@/lib/server/data";
import { compareGroups, stackedByCategory } from "@/lib/server/analytics";
import { essentialSplit, groupBy, summarize } from "@/lib/finance/ledger";
import { addDays, daysBetween, monthLabel, formatDate as fd } from "@/lib/finance/dates";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/types";
import { formatMoney, formatPct } from "@/lib/format";
import { Card, CardHeader, Delta, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ChartFrame, ColumnChart, Donut, RankedBars } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const { range, prev } = rangeFrom(sp, ctx, "last_6_months");
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const cur = summarize(ctx.txs, range);
  const before = summarize(ctx.txs, prev);
  const days = Math.max(1, Math.min(daysBetween(range.from, range.to > ctx.today ? ctx.today : range.to) + 1, daysBetween(range.from, range.to) + 1));
  const split = essentialSplit(ctx.txs, range, ctx.catIdx);
  const stacked = stackedByCategory(ctx, range, "expense", 6);
  const cats = compareGroups(ctx, range, prev, "topCategory", "expense");
  const merchants = groupBy(ctx.txs, range, "merchant", "expense").slice(0, 10);
  const methods = groupBy(ctx.txs, range, "paymentMethod", "expense");
  const accounts = groupBy(ctx.txs, range, "account", "expense");
  const weekly = groupBy(ctx.txs, range, "week", "expense").sort((a, b) => a.key.localeCompare(b.key));
  const dailyRange = { from: daysBetween(range.from, range.to) > 62 ? addDays(range.to > ctx.today ? ctx.today : range.to, -61) : range.from, to: range.to > ctx.today ? ctx.today : range.to };
  const dailyMap = new Map(groupBy(ctx.txs, dailyRange, "day", "expense").map((r) => [r.key, r.amount]));
  const daily: { x: string; amount: number }[] = [];
  for (let d = dailyRange.from; d <= dailyRange.to; d = addDays(d, 1)) daily.push({ x: d, amount: dailyMap.get(d) ?? 0 });
  const yearly = groupBy(ctx.txs, { from: "1900-01-01", to: ctx.today }, "month", "expense").reduce<Record<string, number>>((acc, r) => {
    acc[r.key.slice(0, 4)] = (acc[r.key.slice(0, 4)] ?? 0) + r.amount;
    return acc;
  }, {});
  const q = range.preset === "custom" ? `&range=custom&from=${range.from}&to=${range.to}` : `&range=${range.preset}`;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Net spending: expenses − refunds + loan interest. Transfers, investments and loan principal are never counted."
        actions={
          <Suspense>
            <RangePicker value={range.preset} from={range.from} to={range.to} />
          </Suspense>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total spending" value={f(cur.expenses)} delta={<Delta value={before.expenses ? ((cur.expenses - before.expenses) / before.expenses) * 100 : null} goodWhenUp={false} label="vs prior period" />} />
        <Stat label="Daily average" value={f(Math.round(cur.expenses / days))} hint={`over ${days} days`} />
        <Stat label="Essential" value={f(split.essential)} hint={formatPct(cur.expenses ? (split.essential / cur.expenses) * 100 : null, 0)} tooltip="Categories marked essential (housing, food, utilities, health, insurance, education, loan interest…). Edit in Categories." />
        <Stat label="Discretionary" value={f(split.discretionary)} hint={`${formatPct(cur.expenses ? (split.discretionary / cur.expenses) * 100 : null, 0)}${split.uncategorized ? ` · ${f(split.uncategorized)} uncategorized` : ""}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ChartFrame
            title="Monthly spending by category"
            legend={stacked.series.map((s) => ({ label: s.name, slot: s.slot }))}
            table={{ columns: ["Month", ...stacked.series.map((s) => s.name)], rows: stacked.data.map((r) => [monthLabel(String(r.x)), ...stacked.series.map((s) => f(Number(r[s.key] ?? 0)))]) }}
          >
            <ColumnChart prefs={ctx.fmt} xKey="x" data={stacked.data} series={stacked.series} stacked xFormat="month" height={280} />
          </ChartFrame>
        </div>
        <div className="lg:col-span-4">
          <ChartFrame title="Essential vs discretionary" table={{ columns: ["Type", "Amount"], rows: [["Essential", f(split.essential)], ["Discretionary", f(split.discretionary)], ["Uncategorized", f(split.uncategorized)]] }}>
            <Donut
              prefs={ctx.fmt}
              height={150}
              rows={[
                { key: "e", label: "Essential", value: split.essential, slot: 0 },
                { key: "d", label: "Discretionary", value: split.discretionary, slot: 1 },
                { key: "u", label: "Uncategorized", value: split.uncategorized, slot: 6 },
              ]}
            />
          </ChartFrame>
        </div>
        <div className="lg:col-span-7">
          <Card>
            <CardHeader title="Spending by category" subtitle="Compared with the previous equal period" />
            <Table>
              <thead>
                <tr>
                  <Th>Category</Th>
                  <Th align="right">This period</Th>
                  <Th align="right">Previous</Th>
                  <Th align="right">Change</Th>
                  <Th align="right">Share</Th>
                </tr>
              </thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.key} className="hover:bg-surface-2/50">
                    <Td>
                      <Link href={`/transactions?category=${c.key === "uncategorized" ? "none" : c.key}${q}`} className="flex items-center gap-2 hover:underline">
                        <span className="size-2 rounded-full" style={{ background: c.color }} />
                        {c.label}
                      </Link>
                    </Td>
                    <Td align="right">{f(c.current)}</Td>
                    <Td align="right" className="text-fg-2">
                      {f(c.previous)}
                    </Td>
                    <Td align="right">
                      <Delta value={c.change} goodWhenUp={false} />
                    </Td>
                    <Td align="right" className="text-fg-2">
                      {formatPct(cur.expenses ? (c.current / cur.expenses) * 100 : null, 0)}
                    </Td>
                  </tr>
                ))}
                {!cats.length && (
                  <tr>
                    <Td colSpan={5} className="py-8 text-center text-muted">
                      No spending in this period.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader title="Top merchants" />
            <div className="px-5 pb-5">
              {merchants.length ? <RankedBars prefs={ctx.fmt} rows={merchants.map((m) => ({ key: m.key, label: m.key, value: m.amount, sub: `${m.count}×` }))} /> : <p className="text-[13px] text-muted">No data.</p>}
            </div>
          </Card>
        </div>
        <div className="lg:col-span-6">
          <ChartFrame title="Daily spending" subtitle={`${fd(dailyRange.from, ctx.prefs.dateFormat)} – ${fd(dailyRange.to, ctx.prefs.dateFormat)}`} table={{ columns: ["Day", "Spent"], rows: daily.map((d) => [fd(d.x, ctx.prefs.dateFormat), f(d.amount)]) }}>
            <ColumnChart prefs={ctx.fmt} xKey="x" data={daily} series={[{ key: "amount", name: "Spent", slot: 1 }]} xFormat="date" height={200} />
          </ChartFrame>
        </div>
        <div className="lg:col-span-6">
          <ChartFrame title="Weekly spending" subtitle="Weeks start Monday" table={{ columns: ["Week of", "Spent"], rows: weekly.map((w) => [fd(w.key, ctx.prefs.dateFormat), f(w.amount)]) }}>
            <ColumnChart prefs={ctx.fmt} xKey="x" data={weekly.map((w) => ({ x: w.key, amount: w.amount }))} series={[{ key: "amount", name: "Spent", slot: 1 }]} xFormat="date" height={200} />
          </ChartFrame>
        </div>
        <div className="lg:col-span-4">
          <ChartFrame title="By payment method" table={{ columns: ["Method", "Amount"], rows: methods.map((m) => [PAYMENT_METHOD_LABELS[m.key as keyof typeof PAYMENT_METHOD_LABELS] ?? m.key, f(m.amount)]) }}>
            <Donut prefs={ctx.fmt} height={140} rows={methods.map((m) => ({ key: m.key, label: PAYMENT_METHOD_LABELS[m.key as keyof typeof PAYMENT_METHOD_LABELS] ?? "Not set", value: m.amount }))} />
          </ChartFrame>
        </div>
        <div className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader title="By account" />
            <div className="px-5 pb-5">
              <RankedBars prefs={ctx.fmt} rows={accounts.map((a) => ({ key: a.key, label: accountName(ctx, a.key), value: a.amount }))} />
            </div>
          </Card>
        </div>
        <div className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader title="Annual spending" subtitle="All recorded years" />
            <div className="px-5 pb-5">
              <RankedBars prefs={ctx.fmt} showPct={false} rows={Object.entries(yearly).sort((a, b) => b[0].localeCompare(a[0])).map(([y, v]) => ({ key: y, label: y, value: v, color: categoryColor(ctx, null) }))} />
            </div>
          </Card>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-muted">Category totals include their subcategories. Transactions without a category appear as “Uncategorized”.</p>
    </>
  );
}
