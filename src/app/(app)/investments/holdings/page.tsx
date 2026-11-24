import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { pageCtx, param, type SP } from "@/lib/server/page";
import { invOptions, priceLabel } from "@/lib/server/investments-view";
import { ASSET_CLASSES, ASSET_CLASS_LABELS } from "@/lib/finance/investments";
import { formatMoney, formatNumber, formatPct, minorToInput } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Table, Tabs, Td, Th } from "@/components/ui/core";
import { ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { HoldingFields } from "@/components/investment-forms";
import { saveHolding, updatePrice } from "../actions";

export const metadata = { title: "Holdings" };

export default async function HoldingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const cls = param(sp, "class") ?? "ALL";
  const o = invOptions(ctx);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const positions = ctx.portfolio.positions
    .filter((p) => cls === "ALL" || p.holding.assetClass === cls)
    .sort((a, b) => Number(b.marketValue > 0) - Number(a.marketValue > 0) || b.marketValue - a.marketValue);
  const present = new Set(ctx.holdings.map((h) => h.assetClass));

  return (
    <>
      <PageHeader
        title="Holdings"
        description="Stocks, mutual funds, ETFs, bonds, fixed deposits, SIPs, PPF/EPF/NPS, gold and other assets."
        actions={
          <ModalForm trigger={<><Plus className="size-4" /> Add holding</>} triggerVariant="primary" title="Add holding" action={saveHolding} size="lg">
            <HoldingFields accounts={o.brokerAccounts} baseCurrency={ctx.prefs.baseCurrency} defaultClass={cls !== "ALL" ? cls : undefined} />
          </ModalForm>
        }
      />
      <Tabs
        active={cls}
        items={[{ id: "ALL", label: "All", href: "/investments/holdings" }, ...ASSET_CLASSES.filter((c) => present.has(c) || ["STOCK", "MUTUAL_FUND", "ETF", "BOND", "FIXED_DEPOSIT", "GOLD"].includes(c)).map((c) => ({ id: c, label: ASSET_CLASS_LABELS[c], href: `/investments/holdings?class=${c}`, count: ctx.holdings.filter((h) => h.assetClass === c).length }))]}
      />
      <Card>
        {positions.length === 0 ? (
          <EmptyState title={cls === "ALL" ? "No holdings yet" : `No ${ASSET_CLASS_LABELS[cls as keyof typeof ASSET_CLASS_LABELS]?.toLowerCase()} yet`} description="Add a holding, then record purchases (or an opening position) to track cost, value and returns." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Holding</Th>
                <Th align="right">Units</Th>
                <Th align="right">Avg cost</Th>
                <Th align="right">Price / value</Th>
                <Th align="right">Invested</Th>
                <Th align="right">Value</Th>
                <Th align="right">Unrealized</Th>
                <Th align="right">XIRR</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const h = p.holding;
                const pl = priceLabel(ctx, h);
                const closed = p.marketValue === 0 && p.costBasis === 0;
                return (
                  <tr key={h.id} className={closed ? "opacity-60" : ""}>
                    <Td>
                      <Link href={`/investments/${h.id}`} className="font-medium hover:underline">
                        {h.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                        {ASSET_CLASS_LABELS[h.assetClass]}
                        {h.symbol && <span>· {h.symbol}</span>}
                        {closed && <Badge>Closed position</Badge>}
                        {h.isDemo && <Badge tone="warn">Demo</Badge>}
                      </div>
                    </Td>
                    <Td align="right">{h.valuationMode === "UNITS" ? formatNumber(p.quantity, ctx.fmt) : "—"}</Td>
                    <Td align="right">{p.avgCost ? formatNumber(p.avgCost, ctx.fmt, 2) : "—"}</Td>
                    <Td align="right">
                      {h.valuationMode === "UNITS" ? (h.currentPrice ? formatNumber(h.currentPrice, ctx.fmt) : "—") : h.currentValue != null ? f(h.currentValue) : "—"}
                      <div>
                        <Badge tone={pl.tone}>{pl.text}</Badge>
                      </div>
                    </Td>
                    <Td align="right">{f(p.costBasis)}</Td>
                    <Td align="right" className="font-medium">
                      {f(p.marketValue)}
                    </Td>
                    <Td align="right" className={p.unrealized >= 0 ? "text-pos" : "text-neg"}>
                      {formatMoney(p.unrealized, ctx.fmt, { sign: true })}
                      <div className="text-[11px]">{formatPct(p.costBasis ? (p.unrealized / p.costBasis) * 100 : null, 1, true)}</div>
                    </Td>
                    <Td align="right">{formatPct(p.xirr, 1, true)}</Td>
                    <Td align="right">
                      {!closed && (
                        <ModalForm trigger={<RefreshCw className="size-3.5" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-8" title={`Update ${h.valuationMode === "UNITS" ? "price" : "value"} — ${h.name}`} description="Manually entered valuations are labelled with their date everywhere they appear." action={updatePrice} submitLabel="Update">
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
                          <Field label="Price date" name="date">
                            <Input name="date" type="date" defaultValue={ctx.today} />
                          </Field>
                        </ModalForm>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
