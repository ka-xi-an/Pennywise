import { pageCtx } from "@/lib/server/page";
import { health, type Ctx } from "@/lib/server/data";
import { accountBalances } from "@/lib/finance/ledger";
import { buildPortfolio } from "@/lib/finance/investments";
import { computeNetWorth } from "@/lib/finance/networth";
import { addDays, addMonths, endOfMonth, monthLabel, startOfMonth } from "@/lib/finance/dates";
import { Badge, Card, CardHeader, Notice, PageHeader, ProgressBar, cx } from "@/components/ui/core";
import { ChartFrame, ColumnChart } from "@/components/charts";

export const metadata = { title: "Financial health" };

/** Rebuild the context as it stood at a past month end (balances exact; holdings at cost). */
function ctxAt(ctx: Ctx, asOf: string): Ctx {
  const balances = accountBalances(ctx.accounts, ctx.txsNative, asOf);
  const invTxs = ctx.invTxs.filter((t) => t.date <= asOf);
  const portfolio = buildPortfolio(ctx.holdings.map((h) => ({ ...h, currentPrice: null, currentValue: null })), invTxs, asOf);
  const netWorth = computeNetWorth({ accounts: ctx.accounts.filter((a) => a.openingDate <= asOf), balances, positions: portfolio.positions, assets: ctx.assets, liabilities: ctx.liabilities, fx: ctx.fx, today: asOf });
  return { ...ctx, today: addDays(asOf, 1), balances, portfolio, netWorth, txs: ctx.txs.filter((t) => t.date <= asOf), earliestDate: ctx.earliestDate };
}

export default async function HealthPage() {
  const ctx = await pageCtx();
  const { result, metrics } = health(ctx);
  const history = [5, 4, 3, 2, 1].map((i) => {
    const asOf = endOfMonth(addMonths(startOfMonth(ctx.today), -i));
    return { x: asOf.slice(0, 7), score: asOf >= ctx.earliestDate ? health(ctxAt(ctx, asOf)).result.score : null };
  });
  history.push({ x: ctx.today.slice(0, 7), score: result.score });
  const tone = (s: number | null) => (s == null ? "text-muted" : s >= 70 ? "text-pos" : s >= 40 ? "text-warn" : "text-neg");

  return (
    <>
      <PageHeader title="Financial health" description="A transparent, rules-based score from eight measurable components. It is not a credit score and doesn't guarantee financial security." />
      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <Card className="flex flex-col items-center justify-center p-6 text-center lg:col-span-4">
          <p className="text-[12.5px] font-medium text-fg-2">Overall score</p>
          <p className={cx("mt-1 text-[56px] font-semibold leading-none tracking-tight", tone(result.score))}>{result.score ?? "—"}</p>
          <p className="mt-1 text-[13px] text-fg-2">{result.band}</p>
          <ProgressBar value={result.score} tone="pos" className="mt-4 max-w-xs" label="Health score" />
          <p className="mt-3 text-[11.5px] text-muted">Based on the {metrics.basis}. Components without data are excluded and weights re-balanced.</p>
        </Card>
        <div className="lg:col-span-8">
          <ChartFrame title="Score trend" subtitle="Past months rebuilt from your ledger (investments at cost, current loans)" table={{ columns: ["Month", "Score"], rows: history.map((h) => [monthLabel(h.x), h.score ?? "—"]) }}>
            <ColumnChart prefs={ctx.fmt} xKey="x" data={history.map((h) => ({ x: h.x, score: h.score ?? 0 }))} series={[{ key: "score", name: "Score", slot: 2 }]} xFormat="month" height={200} />
          </ChartFrame>
        </div>
      </div>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Strengths" />
          <ul className="space-y-1.5 px-5 pb-5 text-[13px]">
            {result.strengths.map((s) => (
              <li key={s} className="text-pos">✓ <span className="text-fg-2">{s}</span></li>
            ))}
            {!result.strengths.length && <li className="text-muted">None scoring 70+ yet.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Areas to improve" />
          <ul className="space-y-1.5 px-5 pb-5 text-[13px]">
            {result.weaknesses.map((s) => (
              <li key={s} className="text-neg">! <span className="text-fg-2">{s}</span></li>
            ))}
            {!result.weaknesses.length && <li className="text-muted">No component below 40.</li>}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader title="Components & methodology" />
        <ul className="divide-y divide-line">
          {result.components.map((c) => (
            <li key={c.key} className="grid gap-2 px-5 py-3 md:grid-cols-[220px_1fr_120px] md:items-center">
              <div>
                <p className="text-[13.5px] font-medium">{c.label}</p>
                <p className="text-[11.5px] text-muted">weight {c.weight}%</p>
              </div>
              <div>
                <p className="text-[13px] text-fg-2">{c.display}</p>
                <p className="text-[11.5px] text-muted">{c.rule}</p>
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                {c.score == null ? <Badge>No data</Badge> : <span className={cx("num text-[18px] font-semibold", tone(c.score))}>{c.score}</span>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Notice className="mt-4">Each component maps your measured value linearly between a “poor” anchor (0) and an “excellent” anchor (100). The overall score is the weighted average. Anchors reflect common personal-finance rules of thumb and can be debated — treat the score as a conversation starter, not a verdict.</Notice>
    </>
  );
}
