import Link from "next/link";
import { Suspense } from "react";
import { Plus, Trash2 } from "lucide-react";
import { pageCtx, param, type SP } from "@/lib/server/page";
import { db, n } from "@/lib/server/db";
import { invOptions } from "@/lib/server/investments-view";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction, ModalForm } from "@/components/ui/modal";
import { ParamSelect } from "@/components/range-picker";
import { InvTxFields } from "@/components/investment-forms";
import { deleteInvestmentTransaction, saveInvestmentTx } from "../actions";

export const metadata = { title: "Investment transactions" };

export default async function InvTxPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const holding = param(sp, "holding") ?? "";
  const type = param(sp, "type") ?? "";
  const o = invOptions(ctx);
  const rows = await db.investmentTransaction.findMany({
    where: { userId: ctx.userId, holdingId: holding || undefined, type: type || undefined },
    include: { holding: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return (
    <>
      <PageHeader
        title="Investment transactions"
        description="Buys, SIPs, sales, dividends, bonuses, splits, mergers, fees and tax withheld across all holdings."
        actions={
          <>
            <Suspense>
              <ParamSelect name="holding" label="Holding" value={holding} options={[{ value: "", label: "All holdings" }, ...ctx.holdings.map((h) => ({ value: h.id, label: h.name }))]} />
              <ParamSelect name="type" label="Type" value={type} options={[{ value: "", label: "All types" }, ...["BUY", "SIP", "SELL", "DIVIDEND", "INTEREST", "BONUS", "SPLIT", "MERGER", "FEES", "TAX_WITHHOLDING"].map((t) => ({ value: t, label: t.replace("_", " ").toLowerCase() }))]} />
            </Suspense>
            {o.holdings.length > 0 && (
              <ModalForm trigger={<><Plus className="size-4" /> Record</>} triggerVariant="primary" title="Record investment transaction" action={saveInvestmentTx} size="lg">
                <InvTxFields holdings={o.holdings} accounts={o.cashAccounts} today={ctx.today} sym={o.sym} />
              </ModalForm>
            )}
          </>
        }
      />
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Holding</Th>
              <Th>Type</Th>
              <Th align="right">Units</Th>
              <Th align="right">Price</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Fees</Th>
              <Th align="right"> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <Td className="num">{formatDate(t.date, ctx.fmt)}</Td>
                <Td>
                  <Link href={`/investments/${t.holdingId}`} className="font-medium hover:underline">
                    {t.holding.name}
                  </Link>
                  {t.isDemo && <Badge tone="warn" className="ml-1">Demo</Badge>}
                </Td>
                <Td>
                  <Badge>{t.type.replace("_", " ").toLowerCase()}</Badge>
                </Td>
                <Td align="right">{t.quantity ? formatNumber(t.quantity, ctx.fmt) : t.ratio ? `×${t.ratio}` : "—"}</Td>
                <Td align="right">{t.price ? formatNumber(t.price, ctx.fmt) : "—"}</Td>
                <Td align="right">{n(t.amount) ? formatMoney(n(t.amount), { ...ctx.fmt, currency: t.holding.currency }) : "—"}</Td>
                <Td align="right" className="text-fg-2">{n(t.fees) ? formatMoney(n(t.fees), ctx.fmt) : "—"}</Td>
                <Td align="right">
                  <ConfirmAction action={deleteInvestmentTransaction.bind(null, t.id)} title="Delete this entry?" description="The linked cash movement (if any) is deleted too." size="icon" className="size-7">
                    <Trash2 className="size-3.5" />
                  </ConfirmAction>
                </Td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <Td colSpan={8} className="py-10 text-center text-muted">
                  No investment transactions match.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
