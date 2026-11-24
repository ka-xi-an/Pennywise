import Link from "next/link";
import { Plus, TrendingUp } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { invOptions, priceLabel } from "@/lib/server/investments-view";
import { ASSET_CLASS_LABELS, upcomingMaturities } from "@/lib/finance/investments";
import { addMonths, endOfMonth, monthsInRange, startOfMonth } from "@/lib/finance/dates";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, Notice, PageHeader, Stat, Table, Td, Th, cx } from "@/components/ui/core";
import { ModalForm } from "@/components/ui/modal";
import { ChartFrame, Donut, TrendChart } from "@/components/charts";
import { HoldingFields, InvTxFields } from "@/components/investment-forms";
import { saveHolding, saveInvestmentTx } from "./actions";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const ctx = await pageCtx();
  const pf = ctx.portfolio;
  const o = invOptions(ctx);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const open = pf.positions.filter((p) => p.marketValue > 0 || p.costBasis > 0).sort((a, b) => b.marketValue - a.marketValue);
  const months = monthsInRange({ from: addMonths(startOfMonth(ctx.today), -23), to: ctx.today });
  const contributions = months.map((m) => {
    const end = endOfMonth(`${m}-01`);
    let net = 0;
    for (const p of pf.positions) for (const c of p.cashFlows) if (c.date <= end) net -= c.amount;
    return { x: m, invested: Math.max(0, net) };
  });
  const maturities = upcomingMaturities(ctx.holdings, ctx.today, 120);
  const demoPrices = ctx.holdings.some((h) => h.priceSource === "DEMO");

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Holdings are valued with the latest price you entered (or a configured provider) — each value shows its source and date."
        actions={
          <>
            {o.holdings.length > 0 && (
              <ModalForm trigger={<><Plus className="size-4" /> Record transaction</>} title="Record investment transaction" action={saveInvestmentTx} size="lg">
                <InvTxFields holdings={o.holdings} accounts={o.cashAccounts} today={ctx.today} sym={o.sym} />
              </ModalForm>
            )}
            <ModalForm trigger={<><Plus className="size-4" /> Add holding</>} triggerVariant="primary" title="Add holding" action={saveHolding} size="lg">
              <HoldingFields accounts={o.brokerAccounts} baseCurrency={ctx.prefs.baseCurrency} />
            </ModalForm>
          </>
        }
      />
      {demoPrices && (
        <Notice tone="warn" className="mb-4" title="Demo prices are fictional">
          Demo holdings use invented instruments and made-up prices for illustration only. They are not market data.
        </Notice>
      )}
      {!process.env.MARKET_DATA_PROVIDER && ctx.holdings.length > 0 && (
        <p className="mb-4 text-[12px] text-muted">No market data provider is configured — prices are entered manually. Update them from Holdings.</p>
      )}
      {open.length === 0 ? (
        <Card>
          <EmptyState icon={<TrendingUp className="size-5" />} title="No investments yet" description="Add stocks, mutual funds, ETFs, bonds, FDs, PPF/EPF/NPS or gold. Record purchases with or without a cash movement (use none for positions you already own)." />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
            <Stat label="Current value" value={f(pf.marketValue)} />
            <Stat label="Invested (cost)" value={f(pf.invested)} tooltip="Cost basis of units still held (average cost method)." />
            <Stat label="Unrealized P/L" value={<span className={pf.unrealized >= 0 ? "text-pos" : "text-neg"}>{formatMoney(pf.unrealized, ctx.fmt, { sign: true })}</span>} />
            <Stat label="Realized P/L" value={<span className={pf.realized >= 0 ? "text-pos" : "text-neg"}>{formatMoney(pf.realized, ctx.fmt, { sign: true })}</span>} />
            <Stat label="Dividends & interest" value={f(pf.dividends)} />
            <Stat label="Absolute return" value={formatPct(pf.absoluteReturnPct, 1, true)} tooltip="(Realized + unrealized + payouts − fees) ÷ total money ever invested." />
            <Stat label="XIRR" value={formatPct(pf.xirr, 1, true)} tooltip="Annualised return from the dates and amounts of every investment cash flow plus today's value." />
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <ChartFrame title="Net money invested" subtitle="Cumulative contributions minus withdrawals and payouts (actual cash flows)" table={{ columns: ["Month", "Net invested"], rows: contributions.map((c) => [c.x, f(c.invested)]) }}>
                <TrendChart prefs={ctx.fmt} xKey="x" data={contributions} series={[{ key: "invested", name: "Net invested", slot: 2 }]} xFormat="month" />
              </ChartFrame>
            </div>
            <div className="lg:col-span-4">
              <ChartFrame title="Asset allocation" table={{ columns: ["Class", "Value", "Share"], rows: pf.allocation.map((a) => [ASSET_CLASS_LABELS[a.assetClass], f(a.value), formatPct(a.pct)]) }}>
                <Donut prefs={ctx.fmt} height={150} rows={pf.allocation.map((a) => ({ key: a.assetClass, label: ASSET_CLASS_LABELS[a.assetClass], value: a.value }))} centerLabel="Portfolio" centerValue={formatMoney(pf.marketValue, ctx.fmt, { compact: true })} />
              </ChartFrame>
            </div>
            <div className="lg:col-span-8">
              <Card>
                <CardHeader
                  title="Holdings"
                  action={
                    <Link href="/investments/holdings" className="text-[12px] text-accent hover:underline">
                      All holdings
                    </Link>
                  }
                />
                <Table>
                  <thead>
                    <tr>
                      <Th>Holding</Th>
                      <Th align="right">Value</Th>
                      <Th align="right">Unrealized</Th>
                      <Th align="right">XIRR</Th>
                      <Th align="right">Weight</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.slice(0, 10).map((p) => {
                      const pl = priceLabel(ctx, p.holding);
                      return (
                        <tr key={p.holding.id}>
                          <Td>
                            <Link href={`/investments/${p.holding.id}`} className="font-medium hover:underline">
                              {p.holding.name}
                            </Link>
                            <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
                              {ASSET_CLASS_LABELS[p.holding.assetClass]} · <Badge tone={pl.tone}>{pl.text}</Badge>
                            </div>
                          </Td>
                          <Td align="right">{f(p.marketValue)}</Td>
                          <Td align="right" className={p.unrealized >= 0 ? "text-pos" : "text-neg"}>
                            {formatMoney(p.unrealized, ctx.fmt, { sign: true })}
                          </Td>
                          <Td align="right">{formatPct(p.xirr, 1, true)}</Td>
                          <Td align="right" className="text-fg-2">
                            {formatPct(pf.marketValue ? (p.marketValue / pf.marketValue) * 100 : null, 1)}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
            </div>
            <div className="lg:col-span-4">
              <Card className="h-full">
                <CardHeader title="Maturity tracker" subtitle="Next 120 days" />
                <ul className="divide-y divide-line">
                  {maturities.map((m) => (
                    <li key={m.holding.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                      <Link href={`/investments/${m.holding.id}`} className="font-medium hover:underline">
                        {m.holding.name}
                      </Link>
                      <span className={cx("text-right text-[12px]", m.daysLeft <= 30 ? "text-warn" : "text-fg-2")}>
                        {formatDate(m.holding.maturityDate, ctx.fmt)}
                        <span className="block text-muted">{m.daysLeft} days</span>
                      </span>
                    </li>
                  ))}
                  {!maturities.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No maturities coming up.</li>}
                </ul>
              </Card>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <LinkButton href="/investments/analytics">Rebalancing & benchmarks</LinkButton>
            <LinkButton href="/investments/transactions">Investment transactions</LinkButton>
          </div>
        </>
      )}
    </>
  );
}
