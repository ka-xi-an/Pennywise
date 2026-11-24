import Link from "next/link";
import { Repeat } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { categoryLabel, keyMetrics } from "@/lib/server/data";
import { buildInsights } from "@/lib/server/insights";
import { detectAnomalies, detectRecurring, spendingDrivers } from "@/lib/finance/insights";
import { addDays, addMonths, startOfMonth } from "@/lib/finance/dates";
import { summarize } from "@/lib/finance/ledger";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, Notice, PageHeader, Table, Td, Th, cx } from "@/components/ui/core";
import { ActionButton } from "@/components/ui/modal";
import { createSubscriptionFromCandidate } from "../../recurring/actions";

export const metadata = { title: "Spending intelligence" };

export default async function IntelligencePage() {
  const ctx = await pageCtx();
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const m = keyMetrics(ctx);
  const anomalies = detectAnomalies(ctx.txs, ctx.today, ctx.prefs.largeExpenseThreshold, 60);
  const known = new Set(ctx.rules.map((r) => (r.merchant ?? r.name).trim().toLowerCase()));
  const candidates = detectRecurring(ctx.txs, known);
  const lastMonth = { from: addMonths(startOfMonth(ctx.today), -1), to: addDays(startOfMonth(ctx.today), -1) };
  const prior = { from: addMonths(lastMonth.from, -1), to: addDays(lastMonth.from, -1) };
  const drivers = spendingDrivers(ctx.txs, lastMonth, prior, ctx.catIdx).filter((d) => d.delta !== 0).slice(0, 8);
  const insights = await buildInsights(ctx);
  const lm = summarize(ctx.txs, lastMonth);
  const pm = summarize(ctx.txs, prior);

  // Rule-based recommendations, each with the reason it was triggered.
  const recs: { title: string; why: string; link: string }[] = [];
  if (m.savingsRate != null && m.savingsRate < 20 && m.avgMonthlyIncome > 0)
    recs.push({ title: `Raise savings toward 20% (${f(Math.round(m.avgMonthlyIncome * 0.2))}/month)`, why: `Current rate ${formatPct(m.savingsRate)} over the ${m.basis}.`, link: "/budgets/new" });
  if (m.emergencyMonths != null && m.emergencyMonths < ctx.prefs.emergencyFundMonths)
    recs.push({ title: "Build the emergency fund", why: `Liquid cash covers ${m.emergencyMonths.toFixed(1)} of ${ctx.prefs.emergencyFundMonths} target months.`, link: "/planning/emergency" });
  const subsTotal = candidates.reduce((s, c) => s + c.averageAmount, 0);
  if (candidates.length) recs.push({ title: "Review recurring charges you aren't tracking", why: `${candidates.length} merchant(s) charge about ${f(subsTotal)} on a regular cadence.`, link: "#recurring" });
  if (m.creditUtilization != null && m.creditUtilization > 30) recs.push({ title: "Bring card utilization under 30%", why: `Currently ${formatPct(m.creditUtilization, 0)}.`, link: "/wealth/debt" });
  const highRate = ctx.loans.filter((l) => Number(l.interestRate) >= 10 && l.outstanding > 0);
  if (highRate.length) recs.push({ title: `Consider prepaying ${highRate[0].name}`, why: `${highRate[0].interestRate}% p.a. is high; see the interest saved in the prepayment simulator.`, link: `/wealth/loans/${highRate[0].id}` });
  const top = drivers.find((d) => d.delta > 0);
  if (top) recs.push({ title: `Set a budget for ${categoryLabel(ctx, top.categoryId)}`, why: `Up ${f(top.delta)} last month vs the month before.`, link: "/budgets/new" });

  return (
    <>
      <PageHeader eyebrow={<span className="text-ai">AI Financial Analyst</span>} title="Spending intelligence" description="Patterns detected statistically from your transactions. Each finding states the rule that triggered it." />
      <Notice tone="ai" className="mb-4">
        Unusual = more than 3× the category median and 3σ above its mean over the prior 180 days, or a large first payment to a new merchant. Recurring = same merchant, ≥3 charges in different months, amounts within ±15%, monthly or yearly cadence.
      </Notice>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Recommendations" subtitle="Rule-based, from your data — not financial advice" />
          <ul className="divide-y divide-line">
            {recs.map((r) => (
              <li key={r.title}>
                <Link href={r.link} className="block px-5 py-3 hover:bg-surface-2/60">
                  <p className="text-[13.5px] font-medium">{r.title}</p>
                  <p className="text-[12px] text-muted">{r.why}</p>
                </Link>
              </li>
            ))}
            {!recs.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No recommendations right now — your key ratios look healthy.</li>}
          </ul>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title="What changed last month" subtitle={`${f(lm.expenses)} vs ${f(pm.expenses)} the month before`} />
          <ul className="space-y-2 px-5 pb-5 text-[13px]">
            {drivers.map((d) => (
              <li key={d.categoryId} className="flex justify-between">
                <span>{categoryLabel(ctx, d.categoryId)}</span>
                <span className={cx("num", d.delta > 0 ? "text-neg" : "text-pos")}>{formatMoney(d.delta, ctx.fmt, { sign: true })}</span>
              </li>
            ))}
            {!drivers.length && <li className="text-muted">Not enough history to compare.</li>}
          </ul>
        </Card>
        <Card className="lg:col-span-12">
          <CardHeader title="Unusual transactions" subtitle="Last 60 days" />
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Merchant</Th>
                <Th>Category</Th>
                <Th>Why flagged</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a) => (
                <tr key={a.tx.id}>
                  <Td>{formatDate(a.tx.date, ctx.fmt)}</Td>
                  <Td>
                    <Link href={`/transactions/${a.tx.id}`} className="font-medium hover:underline">
                      {a.tx.merchant ?? a.tx.description ?? "—"}
                    </Link>
                  </Td>
                  <Td className="text-fg-2">{categoryLabel(ctx, a.tx.categoryId)}</Td>
                  <Td>
                    <Badge tone="warn">{a.reason}</Badge>
                  </Td>
                  <Td align="right">{f(a.tx.amount)}</Td>
                </tr>
              ))}
              {!anomalies.length && (
                <tr>
                  <Td colSpan={5} className="py-6 text-center text-muted">
                    Nothing unusual detected.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
        <Card className="lg:col-span-12" id="recurring">
          <CardHeader title="Possible subscriptions & recurring charges" subtitle="Detected from repeated payments; not yet tracked as bills" />
          <Table>
            <thead>
              <tr>
                <Th>Merchant</Th>
                <Th align="right">Typical amount</Th>
                <Th align="right">Times seen</Th>
                <Th>Cadence</Th>
                <Th>Last charge</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.merchant}>
                  <Td className="font-medium">{c.merchant}</Td>
                  <Td align="right">{f(c.averageAmount)}</Td>
                  <Td align="right">{c.occurrences}</Td>
                  <Td>{c.cadenceDays > 300 ? "Yearly" : "Monthly"}</Td>
                  <Td className="text-fg-2">{formatDate(c.lastDate, ctx.fmt)}</Td>
                  <Td align="right">
                    <ActionButton
                      action={createSubscriptionFromCandidate.bind(null, { merchant: c.merchant, amount: c.averageAmount, accountId: c.accountId, categoryId: c.categoryId, lastDate: c.lastDate, yearly: c.cadenceDays > 300 })}
                    >
                      <Repeat className="size-3.5" /> Track as subscription
                    </ActionButton>
                  </Td>
                </tr>
              ))}
              {!candidates.length && (
                <tr>
                  <Td colSpan={6} className="py-6 text-center text-muted">
                    No untracked recurring charges found.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
        <Card className="lg:col-span-12">
          <CardHeader title="All current insights" />
          <ul className="grid gap-2 px-5 pb-5 md:grid-cols-2">
            {insights.map((i) => (
              <li key={i.id} className="rounded-lg border border-line p-3">
                <p className="text-[13px] font-medium">{i.title}</p>
                <p className="text-[12px] text-fg-2">{i.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <p className="mt-3 text-[11.5px] text-muted">Findings refresh automatically as you record transactions.</p>
    </>
  );
}
