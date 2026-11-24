import { Plus, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { db } from "@/lib/server/db";
import { ASSET_CLASSES, ASSET_CLASS_LABELS, computeCAGR, rebalance, xirr } from "@/lib/finance/investments";
import { yearFraction } from "@/lib/finance/dates";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction, ModalForm } from "@/components/ui/modal";
import { ActionForm, Field, Input, SubmitButton } from "@/components/ui/form";
import { RankedBars } from "@/components/charts";
import { saveTargetAllocation } from "../../settings/actions";
import { deleteBenchmark, saveBenchmark } from "../actions";

export const metadata = { title: "Portfolio analytics" };

export default async function InvestmentAnalytics() {
  const ctx = await pageCtx();
  const pf = ctx.portfolio;
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const targets = ctx.prefs.targetAllocation;
  const reb = Object.keys(targets).length ? rebalance(pf.allocation.map((a) => ({ assetClass: a.assetClass, value: a.value })), targets) : [];
  const benchmarks = await db.benchmark.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" } });

  // Portfolio XIRR restricted to each benchmark window, for an apples-to-apples comparison.
  // Valid only when the whole portfolio history starts inside the window (we have no historical
  // valuation at the window start), and the window ends today.
  const allFlows = pf.positions.flatMap((p) => p.cashFlows);
  const portfolioXirrBetween = (from: string, to: string): { value: number | null; note?: string } => {
    if (allFlows.some((c) => c.date < from)) return { value: null, note: "portfolio predates the window" };
    if (to < ctx.today) return { value: null, note: "window must end today" };
    return { value: xirr([...allFlows, { date: ctx.today, amount: pf.marketValue }]) };
  };

  const returns = pf.positions.filter((p) => p.totalInvested > 0).sort((a, b) => (b.xirr ?? -999) - (a.xirr ?? -999));
  const divByYear = new Map<string, number>();
  for (const t of ctx.invTxs) if (t.type === "DIVIDEND" || t.type === "INTEREST") divByYear.set(t.date.slice(0, 4), (divByYear.get(t.date.slice(0, 4)) ?? 0) + t.amount - t.fees);

  return (
    <>
      <PageHeader title="Portfolio analytics" description="Allocation vs target, rebalancing, benchmark comparison and return attribution." />
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Rebalancing" subtitle={Object.keys(targets).length ? "Buy (+) or sell (−) to reach your target allocation" : "Set a target allocation to see rebalancing trades"} />
          {reb.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Asset class</Th>
                  <Th align="right">Current</Th>
                  <Th align="right">Current %</Th>
                  <Th align="right">Target %</Th>
                  <Th align="right">Adjustment</Th>
                </tr>
              </thead>
              <tbody>
                {reb.map((r) => (
                  <tr key={r.assetClass}>
                    <Td>{ASSET_CLASS_LABELS[r.assetClass as keyof typeof ASSET_CLASS_LABELS] ?? r.assetClass}</Td>
                    <Td align="right">{f(r.current)}</Td>
                    <Td align="right">{formatPct(r.currentPct)}</Td>
                    <Td align="right">{formatPct(r.targetPct)}</Td>
                    <Td align="right" className={Math.abs(r.delta) < pf.marketValue * 0.01 ? "text-muted" : r.delta > 0 ? "text-pos" : "text-neg"}>
                      {formatMoney(r.delta, ctx.fmt, { sign: true })}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <div className="border-t border-line px-5 py-4">
            <ActionForm action={saveTargetAllocation} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ASSET_CLASSES.map((c) => (
                <label key={c} className="text-[12px] text-fg-2">
                  {ASSET_CLASS_LABELS[c]}
                  <span className="mt-1 flex items-center gap-1">
                    <input name={`t_${c}`} defaultValue={targets[c] ?? ""} inputMode="decimal" className="num h-8 w-full rounded-md border border-line bg-surface px-2 text-right text-[13px]" aria-label={`${ASSET_CLASS_LABELS[c]} target %`} />%
                  </span>
                </label>
              ))}
              <div className="col-span-2 flex items-end justify-end sm:col-span-4">
                <SubmitButton variant="secondary">Save targets (must total 100%)</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader
            title="Benchmark comparison"
            subtitle="Enter index levels from an official source; nothing is fetched or estimated."
            action={
              <ModalForm trigger={<><Plus className="size-4" /> Add</>} triggerSize="sm" title="Add benchmark" description="E.g. a total-return index's closing level on two dates, from the index provider's website." action={saveBenchmark}>
                <Field label="Name" name="name">
                  <Input name="name" placeholder="e.g. Nifty 50 TRI" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start date" name="startDate">
                    <Input name="startDate" type="date" />
                  </Field>
                  <Field label="Start level" name="startValue">
                    <Input name="startValue" inputMode="decimal" />
                  </Field>
                  <Field label="End date" name="endDate">
                    <Input name="endDate" type="date" defaultValue={ctx.today} />
                  </Field>
                  <Field label="End level" name="endValue">
                    <Input name="endValue" inputMode="decimal" />
                  </Field>
                </div>
              </ModalForm>
            }
          />
          <ul className="divide-y divide-line">
            {benchmarks.map((b) => {
              const bc = computeCAGR(Number(b.startValue), Number(b.endValue), yearFraction(b.startDate, b.endDate));
              const px = portfolioXirrBetween(b.startDate, b.endDate);
              return (
                <li key={b.id} className="px-5 py-3 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{b.name}</span>
                    <ConfirmAction action={deleteBenchmark.bind(null, b.id)} title="Remove benchmark?" size="icon" className="size-7">
                      <Trash2 className="size-3.5" />
                    </ConfirmAction>
                  </div>
                  <p className="text-[12px] text-muted">
                    {formatDate(b.startDate, ctx.fmt)} → {formatDate(b.endDate, ctx.fmt)} · user-entered levels
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <span>
                      Benchmark CAGR <b className="num">{formatPct(bc, 1)}</b>
                    </span>
                    <span>
                      Your XIRR{" "}
                      {px.value != null ? (
                        <b className={`num ${bc != null && px.value >= bc ? "text-pos" : "text-neg"}`}>{formatPct(px.value, 1)}</b>
                      ) : (
                        <span className="text-muted">n/a — {px.note}</span>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
            {!benchmarks.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No benchmarks yet.</li>}
          </ul>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader title="Returns by holding" subtitle="XIRR on actual dated cash flows" />
          <div className="px-5 pb-5">
            <RankedBars prefs={ctx.fmt} showPct={false} rows={returns.slice(0, 12).map((p) => ({ key: p.holding.id, label: p.holding.name, value: p.totalReturn, sub: formatPct(p.xirr, 1, true), href: `/investments/${p.holding.id}` }))} />
          </div>
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title="Income from investments" subtitle="Dividends and interest payouts by year" />
          <Table>
            <tbody>
              {[...divByYear.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([y, v]) => (
                <tr key={y}>
                  <Td>{y}</Td>
                  <Td align="right">{f(v)}</Td>
                </tr>
              ))}
              {!divByYear.size && (
                <tr>
                  <Td className="py-6 text-center text-muted">No payouts recorded.</Td>
                </tr>
              )}
            </tbody>
          </Table>
          <div className="px-5 py-3">
            <Notice>Realized gains total {f(pf.realized)}. See the Tax Center for short/long-term classification.</Notice>
          </div>
        </Card>
      </div>
    </>
  );
}
