import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { db, n } from "@/lib/server/db";
import { invOptions, priceLabel } from "@/lib/server/investments-view";
import { ASSET_CLASS_LABELS } from "@/lib/finance/investments";
import { daysBetween } from "@/lib/finance/dates";
import { formatDate, formatMoney, formatNumber, formatPct, minorToInput } from "@/lib/format";
import { Badge, Card, CardHeader, KV, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction, ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { HoldingFields, InvTxFields } from "@/components/investment-forms";
import { ChartFrame, TrendChart } from "@/components/charts";
import { deleteHolding, deleteInvestmentTransaction, saveHolding, saveInvestmentTx, updatePrice } from "../actions";

const TYPE: Record<string, string> = { BUY: "Buy", SIP: "SIP", SELL: "Sell", DIVIDEND: "Dividend", INTEREST: "Interest", BONUS: "Bonus", SPLIT: "Split", MERGER: "Merger", FEES: "Fees", TAX_WITHHOLDING: "TDS" };

export default async function HoldingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const p = ctx.portfolio.positions.find((x) => x.holding.id === id);
  if (!p) notFound();
  const h = p.holding;
  const o = invOptions(ctx);
  const fmt = { ...ctx.fmt, currency: h.currency };
  const f = (v: number) => formatMoney(v, fmt);
  const [txs, prices, raw] = await Promise.all([
    db.investmentTransaction.findMany({ where: { holdingId: id, userId: ctx.userId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.priceUpdate.findMany({ where: { holdingId: id }, orderBy: { date: "asc" } }),
    db.investmentHolding.findUniqueOrThrow({ where: { id } }),
  ]);
  const pl = priceLabel(ctx, h);

  return (
    <>
      <Link href="/investments/holdings" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Holdings
      </Link>
      <PageHeader
        eyebrow={[ASSET_CLASS_LABELS[h.assetClass], h.symbol, raw.exchange, raw.isin].filter(Boolean).join(" · ")}
        title={
          <span className="flex items-center gap-2">
            {h.name} {h.isDemo && <Badge tone="warn">Demo</Badge>}
          </span>
        }
        actions={
          <>
            <ModalForm trigger={<><RefreshCw className="size-4" /> Update {h.valuationMode === "UNITS" ? "price" : "value"}</>} title="Update valuation" description="Stored with its date and labelled as manually entered." action={updatePrice}>
              <input type="hidden" name="holdingId" value={h.id} />
              {h.valuationMode === "UNITS" ? (
                <Field label="Price per unit / NAV" name="price">
                  <Input name="price" inputMode="decimal" defaultValue={h.currentPrice ?? ""} />
                </Field>
              ) : (
                <Field label="Current value" name="value">
                  <MoneyInput name="value" currencySymbol={o.sym} defaultValue={h.currentValue != null ? minorToInput(h.currentValue) : ""} />
                </Field>
              )}
              <Field label="As of" name="date">
                <Input name="date" type="date" defaultValue={ctx.today} />
              </Field>
            </ModalForm>
            <ModalForm trigger={<><Plus className="size-4" /> Transaction</>} triggerVariant="primary" title={`Record transaction — ${h.name}`} action={saveInvestmentTx} size="lg">
              <InvTxFields holdings={o.holdings} accounts={o.cashAccounts} today={ctx.today} sym={o.sym} fixedHoldingId={h.id} />
            </ModalForm>
            <ModalForm trigger={<Pencil className="size-4" />} triggerSize="icon" title="Edit holding" action={saveHolding} size="lg" resetOnSuccess={false}>
              <HoldingFields
                accounts={o.brokerAccounts}
                baseCurrency={ctx.prefs.baseCurrency}
                initial={{ id: h.id, name: h.name, symbol: h.symbol, isin: raw.isin, exchange: raw.exchange, assetClass: h.assetClass, valuationMode: h.valuationMode, currency: h.currency, accountId: h.accountId, interestRate: h.interestRate, maturityDate: h.maturityDate, notes: raw.notes }}
              />
            </ModalForm>
            <ConfirmAction action={deleteHolding.bind(null, h.id)} title={`Delete ${h.name}?`} description={`Deletes ${txs.length} investment transaction(s) and the cash movements they posted, so balances stay consistent.`} variant="secondary" size="icon">
              <Trash2 className="size-4" />
            </ConfirmAction>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Current value" value={f(p.marketValue)} hint={<Badge tone={pl.tone}>{pl.text}</Badge>} />
        <Stat label="Cost basis" value={f(p.costBasis)} hint={p.avgCost ? `avg ${formatNumber(p.avgCost, ctx.fmt, 2)}/unit` : undefined} />
        <Stat label="Unrealized" value={<span className={p.unrealized >= 0 ? "text-pos" : "text-neg"}>{formatMoney(p.unrealized, fmt, { sign: true })}</span>} />
        <Stat label="Realized" value={<span className={p.realized >= 0 ? "text-pos" : "text-neg"}>{formatMoney(p.realized, fmt, { sign: true })}</span>} />
        <Stat label="XIRR" value={formatPct(p.xirr, 1, true)} hint={p.cagr != null ? `CAGR ${formatPct(p.cagr, 1)}` : undefined} tooltip="CAGR assumes a single investment at the first purchase date; XIRR accounts for every dated cash flow." />
        <Stat label="Payouts received" value={f(p.dividends)} hint={p.fees || p.taxWithheld ? `fees ${f(p.fees)} · TDS ${f(p.taxWithheld)}` : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 space-y-4">
          <Card>
            <CardHeader title="Transactions" subtitle="Average-cost method. Deleting a row also removes the cash movement it posted." />
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Type</Th>
                  <Th align="right">Units</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">Fees</Th>
                  <Th>Cash</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id}>
                    <Td className="num">{formatDate(t.date, ctx.fmt)}</Td>
                    <Td>
                      <Badge tone={t.type === "SELL" ? "accent" : t.type === "DIVIDEND" || t.type === "INTEREST" ? "pos" : "neutral"}>{TYPE[t.type] ?? t.type}</Badge>
                    </Td>
                    <Td align="right">{t.quantity ? formatNumber(t.quantity, ctx.fmt) : t.ratio ? `×${t.ratio}` : "—"}</Td>
                    <Td align="right">{t.price ? formatNumber(t.price, ctx.fmt) : "—"}</Td>
                    <Td align="right">{n(t.amount) ? f(n(t.amount)) : "—"}</Td>
                    <Td align="right" className="text-fg-2">{n(t.fees) ? f(n(t.fees)) : "—"}</Td>
                    <Td>{t.cashTransactionId ? <Link href={`/transactions/${t.cashTransactionId}`} className="text-[12px] text-accent hover:underline">Ledger entry</Link> : <span className="text-[12px] text-muted">None</span>}</Td>
                    <Td align="right">
                      <ConfirmAction action={deleteInvestmentTransaction.bind(null, t.id)} title="Delete this entry?" description="Position, returns and any linked cash movement are recalculated." size="icon" className="size-7">
                        <Trash2 className="size-3.5" />
                      </ConfirmAction>
                    </Td>
                  </tr>
                ))}
                {!txs.length && (
                  <tr>
                    <Td colSpan={8} className="py-8 text-center text-muted">
                      No transactions. Record a purchase — or an opening position with no cash movement.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
          {p.realizedLots.length > 0 && (
            <Card>
              <CardHeader title="Realized gains" subtitle="Per sale, average-cost basis" />
              <Table>
                <thead>
                  <tr>
                    <Th>Sold on</Th>
                    <Th align="right">Proceeds</Th>
                    <Th align="right">Cost</Th>
                    <Th align="right">Gain</Th>
                    <Th align="right">Held since</Th>
                  </tr>
                </thead>
                <tbody>
                  {p.realizedLots.map((l, i) => (
                    <tr key={i}>
                      <Td>{formatDate(l.date, ctx.fmt)}</Td>
                      <Td align="right">{f(l.proceeds)}</Td>
                      <Td align="right">{f(l.costBasis)}</Td>
                      <Td align="right" className={l.gain >= 0 ? "text-pos" : "text-neg"}>{formatMoney(l.gain, fmt, { sign: true })}</Td>
                      <Td align="right" className="text-fg-2">{l.firstAcquired ? `${formatDate(l.firstAcquired, ctx.fmt)} (${daysBetween(l.firstAcquired, l.date)}d)` : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-4 lg:col-span-4">
          {prices.length > 1 && (
            <ChartFrame title={h.valuationMode === "UNITS" ? "Price history" : "Valuation history"} subtitle="Values you entered" table={{ columns: ["Date", "Value", "Source"], rows: prices.map((x) => [formatDate(x.date, ctx.fmt), x.price ?? (x.value != null ? f(n(x.value)) : ""), x.source]) }}>
              <TrendChart prefs={fmt} xKey="x" data={prices.map((x) => ({ x: x.date, v: x.price ? Math.round(Number(x.price) * 100) : n(x.value ?? BigInt(0)) }))} series={[{ key: "v", name: "Value", slot: 0, type: "line" }]} xFormat="date" height={180} />
            </ChartFrame>
          )}
          <Card>
            <CardHeader title="Details" />
            <div className="divide-y divide-line px-5 pb-4">
              {h.valuationMode === "UNITS" && <KV k="Units held" v={formatNumber(p.quantity, ctx.fmt)} />}
              <KV k="Total ever invested" v={f(p.totalInvested)} />
              <KV k="Absolute return" v={formatPct(p.absoluteReturnPct, 1, true)} />
              <KV k="Total return" v={formatMoney(p.totalReturn, fmt, { sign: true })} />
              {p.firstDate && <KV k="First investment" v={formatDate(p.firstDate, ctx.fmt)} />}
              {h.interestRate && <KV k="Interest rate" v={`${h.interestRate}% p.a.`} />}
              {h.maturityDate && <KV k="Maturity" v={formatDate(h.maturityDate, ctx.fmt)} />}
              {h.accountId && <KV k="Account" v={<Link className="hover:underline" href={`/accounts/${h.accountId}`}>{ctx.accountById.get(h.accountId)?.name}</Link>} />}
              <KV k="Valuation source" v={pl.text} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
