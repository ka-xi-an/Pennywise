import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { MANUAL_ASSET_LABELS, MANUAL_ASSET_TYPES } from "@/lib/finance/networth";
import { formatDate, formatMoney, formatPct, minorToInput } from "@/lib/format";
import { Badge, Card, CardHeader, Notice, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction, ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { deleteAsset, saveAsset } from "../actions";

export const metadata = { title: "Assets" };

export default async function AssetsPage() {
  const ctx = await pageCtx();
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const sym = ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency;
  const nw = ctx.netWorth;

  const AssetFields = ({ a }: { a?: (typeof ctx.assets)[number] }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {a && <input type="hidden" name="id" value={a.id} />}
      <Field label="Name" name="name">
        <Input name="name" defaultValue={a?.name ?? ""} />
      </Field>
      <Field label="Type" name="type" hint="Stocks, funds, FDs, gold & PPF belong in Investments">
        <Select name="type" defaultValue={a?.type ?? "REAL_ESTATE"}>
          {MANUAL_ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {MANUAL_ASSET_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Current value" name="currentValue">
        <MoneyInput name="currentValue" currencySymbol={sym} defaultValue={a ? minorToInput(a.currentValue) : ""} />
      </Field>
      <Field label="Valued on" name="valuationDate">
        <Input name="valuationDate" type="date" defaultValue={a?.valuationDate ?? ctx.today} />
      </Field>
      <Field label="Purchase price" name="purchaseValue">
        <MoneyInput name="purchaseValue" currencySymbol={sym} defaultValue={a?.purchaseValue != null ? minorToInput(a.purchaseValue) : ""} />
      </Field>
      <Field label="Purchase date" name="purchaseDate">
        <Input name="purchaseDate" type="date" defaultValue={a?.purchaseDate ?? ""} />
      </Field>
      <Field label="Currency" name="currency">
        <Input name="currency" defaultValue={a?.currency ?? ctx.prefs.baseCurrency} maxLength={3} />
      </Field>
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={a?.notes ?? ""} />
      </Field>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Assets"
        description="Everything you own. Bank balances and investments are tracked in their own modules; add property, vehicles, business equity and other assets here."
        actions={
          <ModalForm trigger={<><Plus className="size-4" /> Add asset</>} triggerVariant="primary" title="Add asset" action={saveAsset} size="lg">
            <AssetFields />
          </ModalForm>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total assets" value={f(nw.totalAssets)} />
        <Stat label="Cash & bank" value={<Link href="/accounts" className="hover:underline">{f(nw.byGroup.CASH_BANK + nw.byGroup.INVESTMENT_CASH)}</Link>} hint="from accounts" />
        <Stat label="Investments" value={<Link href="/investments" className="hover:underline">{f(nw.byGroup.INVESTMENTS)}</Link>} hint="from holdings" />
        <Stat label="Property & other" value={f(nw.byGroup.OTHER_ASSETS)} hint="tracked below" />
      </div>
      <Notice className="mb-4">To avoid double counting, investment holdings (including gold, FDs, PPF/EPF/NPS) are valued in Investments and can&apos;t be added here.</Notice>
      <Card>
        <CardHeader title="Other assets" />
        <Table>
          <thead>
            <tr>
              <Th>Asset</Th>
              <Th align="right">Current value</Th>
              <Th align="right">Purchase price</Th>
              <Th align="right">Change</Th>
              <Th>Valued on</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {ctx.assets.map((a) => (
              <tr key={a.id}>
                <Td>
                  <div className="font-medium">
                    {a.name} {a.isDemo && <Badge tone="warn">Demo</Badge>}
                  </div>
                  <div className="text-[11.5px] text-muted">{MANUAL_ASSET_LABELS[a.type] ?? a.type}</div>
                </Td>
                <Td align="right">{formatMoney(a.currentValue, { ...ctx.fmt, currency: a.currency })}</Td>
                <Td align="right" className="text-fg-2">{a.purchaseValue != null ? formatMoney(a.purchaseValue, { ...ctx.fmt, currency: a.currency }) : "—"}</Td>
                <Td align="right" className={a.purchaseValue != null && a.currentValue < a.purchaseValue ? "text-neg" : "text-pos"}>
                  {a.purchaseValue ? formatPct(((a.currentValue - a.purchaseValue) / a.purchaseValue) * 100, 1, true) : "—"}
                </Td>
                <Td className="text-fg-2">{formatDate(a.valuationDate, ctx.fmt)}</Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    <ModalForm trigger={<Pencil className="size-3.5" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-8" title={`Edit ${a.name}`} action={saveAsset} size="lg" resetOnSuccess={false}>
                      <AssetFields a={a} />
                    </ModalForm>
                    <ConfirmAction action={deleteAsset.bind(null, a.id)} title={`Delete ${a.name}?`} size="icon" className="size-8">
                      <Trash2 className="size-3.5" />
                    </ConfirmAction>
                  </div>
                </Td>
              </tr>
            ))}
            {!ctx.assets.length && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-muted">
                  No property or other assets recorded.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
