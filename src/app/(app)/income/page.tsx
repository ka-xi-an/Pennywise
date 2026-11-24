import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { pageCtx, rangeFrom, type SP } from "@/lib/server/page";
import { compareGroups, stackedByCategory } from "@/lib/server/analytics";
import { groupBy, incomeOf, summarize } from "@/lib/finance/ledger";
import { addDays, financialYear, monthLabel, fyFromLabel, formatDate as fd } from "@/lib/finance/dates";
import { occurrencesBetween } from "@/lib/finance/recurring";
import { formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, Delta, LinkButton, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ChartFrame, ColumnChart, RankedBars } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";

export const metadata = { title: "Income" };

export default async function IncomePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const { range, prev } = rangeFrom(sp, ctx, "this_fy");
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const cur = summarize(ctx.txs, range);
  const before = summarize(ctx.txs, prev);
  const stacked = stackedByCategory(ctx, range, "income", 5);
  const sources = compareGroups(ctx, range, prev, "topCategory", "income");
  const payers = groupBy(ctx.txs, range, "merchant", "income").slice(0, 8);
  let taxable = 0,
    exempt = 0;
  for (const t of ctx.txs) {
    if (t.date < range.from || t.date > range.to) continue;
    const v = incomeOf(t);
    if (!v) continue;
    const c = t.categoryId ? ctx.catIdx.get(t.categoryId) : null;
    if (c && !c.taxable) exempt += v;
    else taxable += v;
  }

  // Expected (scheduled) vs received for recurring income
  const incomeRules = ctx.rules.filter((r) => r.txType === "INCOME" && r.active);
  const expected = incomeRules.flatMap((r) => {
    const rec = new Map(r.occurrences.map((o) => [o.dueDate, o]));
    return occurrencesBetween(r, range.from, range.to > ctx.today ? addDays(ctx.today, 31) : range.to).map((d) => {
      const o = rec.get(d);
      const received = o?.transactionId ? ctx.txs.find((t) => t.id === o.transactionId)?.amount ?? null : null;
      return { rule: r, due: d, expected: r.amount, received, status: o?.status ?? (d > ctx.today ? "UPCOMING" : "NOT_RECORDED") };
    });
  });

  // Annual (FY) summary for the last 3 FYs
  const fyLabels = [0, 1, 2].map((i) => financialYear(addDays(financialYear(ctx.today, ctx.prefs.fyStartMonth).from, -365 * i), ctx.prefs.fyStartMonth).label);
  const fySummary = [...new Set(fyLabels)].map((label) => {
    const r = fyFromLabel(label, ctx.prefs.fyStartMonth);
    return { label, ...summarize(ctx.txs, r) };
  });
  const growth = fySummary[1]?.income ? ((fySummary[0].income - fySummary[1].income) / fySummary[1].income) * 100 : null;

  return (
    <>
      <PageHeader
        title="Income"
        description="Salary, freelance, business, rental, dividends and interest — from your recorded transactions."
        actions={
          <>
            <Suspense>
              <RangePicker value={range.preset} from={range.from} to={range.to} />
            </Suspense>
            <LinkButton href="/recurring">
              <Plus className="size-4" /> Recurring income
            </LinkButton>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total income" value={f(cur.income)} delta={<Delta value={before.income ? ((cur.income - before.income) / before.income) * 100 : null} label="vs prior period" />} />
        <Stat label="Taxable" value={f(taxable)} hint={formatPct(cur.income ? (taxable / cur.income) * 100 : null, 0)} tooltip="Based on each income category's taxable flag. This is a classification aid, not a tax computation." />
        <Stat label="Non-taxable" value={f(exempt)} hint="gifts, tax refunds, etc." />
        <Stat label="Year-on-year growth" value={formatPct(growth, 1, true)} hint={fySummary[1] ? `FY ${fySummary[0].label} vs ${fySummary[1].label}` : "Needs two financial years"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ChartFrame
            title="Income by source"
            legend={stacked.series.map((s) => ({ label: s.name, slot: s.slot }))}
            table={{ columns: ["Month", ...stacked.series.map((s) => s.name)], rows: stacked.data.map((r) => [monthLabel(String(r.x)), ...stacked.series.map((s) => f(Number(r[s.key] ?? 0)))]) }}
          >
            <ColumnChart prefs={ctx.fmt} xKey="x" data={stacked.data} series={stacked.series} stacked xFormat="month" height={280} />
          </ChartFrame>
        </div>
        <div className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader title="Top payers" />
            <div className="px-5 pb-5">{payers.length ? <RankedBars prefs={ctx.fmt} rows={payers.map((p) => ({ key: p.key, label: p.key, value: p.amount, sub: `${p.count}×` }))} /> : <p className="text-[13px] text-muted">No income recorded.</p>}</div>
          </Card>
        </div>
        <div className="lg:col-span-7">
          <Card>
            <CardHeader title="Income sources" subtitle="Compared with the previous equal period" />
            <Table>
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th align="right">This period</Th>
                  <Th align="right">Previous</Th>
                  <Th align="right">Change</Th>
                  <Th align="center">Taxable</Th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.key}>
                    <Td>
                      <Link href={`/transactions?category=${s.key === "uncategorized" ? "none" : s.key}&type=INCOME,DIVIDEND,INTEREST`} className="flex items-center gap-2 hover:underline">
                        <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}
                      </Link>
                    </Td>
                    <Td align="right">{f(s.current)}</Td>
                    <Td align="right" className="text-fg-2">
                      {f(s.previous)}
                    </Td>
                    <Td align="right">
                      <Delta value={s.change} />
                    </Td>
                    <Td align="center">{ctx.catIdx.get(s.key)?.taxable === false ? <Badge>No</Badge> : <Badge tone="info">Yes</Badge>}</Td>
                  </tr>
                ))}
                {!sources.length && (
                  <tr>
                    <Td colSpan={5} className="py-8 text-center text-muted">
                      No income in this period.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Card>
            <CardHeader title="Expected vs received" subtitle="Scheduled recurring income in this period" />
            {expected.length ? (
              <ul className="divide-y divide-line">
                {expected.slice(0, 12).map((e) => (
                  <li key={e.rule.id + e.due} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px]">
                    <span>
                      <span className="font-medium">{e.rule.name}</span>
                      <span className="block text-[11.5px] text-muted">due {fd(e.due, ctx.prefs.dateFormat)}</span>
                    </span>
                    <span className="text-right">
                      <span className="num block">{e.received != null ? f(e.received) : f(e.expected)}</span>
                      {e.status === "PAID" ? (
                        e.received != null && e.received !== e.expected ? <Badge tone="warn">Received {f(e.received)} vs {f(e.expected)}</Badge> : <Badge tone="pos">Received</Badge>
                      ) : e.status === "UPCOMING" ? (
                        <Badge>Expected</Badge>
                      ) : e.status === "SKIPPED" ? (
                        <Badge>Skipped</Badge>
                      ) : (
                        <Badge tone="warn">Not recorded</Badge>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[13px] text-muted">
                No recurring income scheduled.{" "}
                <Link href="/recurring" className="text-accent underline">
                  Add salary or rent
                </Link>{" "}
                to track expected vs received.
              </p>
            )}
          </Card>
          <Card>
            <CardHeader title="Financial-year summary" />
            <Table>
              <thead>
                <tr>
                  <Th>FY</Th>
                  <Th align="right">Income</Th>
                  <Th align="right">Monthly avg</Th>
                  <Th align="right">Saved</Th>
                </tr>
              </thead>
              <tbody>
                {fySummary.map((y) => (
                  <tr key={y.label}>
                    <Td>{y.label}</Td>
                    <Td align="right">{f(y.income)}</Td>
                    <Td align="right">{f(Math.round(y.income / 12))}</Td>
                    <Td align="right">{formatPct(y.savingsRate, 0)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
      <p className="mt-4 text-[12px] text-muted">Realized capital gains are reported in Investments and the Tax Center; sale proceeds are not counted as income here.</p>
    </>
  );
}
