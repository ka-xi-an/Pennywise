import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { db, n } from "@/lib/server/db";
import { txFormOptions } from "@/lib/server/options";
import { txView } from "@/lib/server/display";
import { accountName, categoryLabel } from "@/lib/server/data";
import { TX_TYPE_LABELS, PAYMENT_METHOD_LABELS, type TxType } from "@/lib/finance/types";
import { formatDate, formatMoney, minorToInput, formatNumber } from "@/lib/format";
import { Badge, Card, CardHeader, KV, PageHeader } from "@/components/ui/core";
import { ActionButton, ConfirmAction } from "@/components/ui/modal";
import { Attachments } from "@/components/attachments";
import { deleteTransaction, duplicateTransaction } from "../actions";
import { EditTransaction } from "./edit";

export default async function TransactionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const t = await db.transaction.findFirst({
    where: { id, userId: ctx.userId },
    include: { tags: { include: { tag: true } }, attachments: true, investmentTxn: { include: { holding: true } }, refunds: true, refundOf: true, loan: true, recurringRule: true, importBatch: true },
  });
  if (!t) notFound();
  const rec = ctx.txsNative.find((x) => x.id === id)!;
  const v = txView(ctx, rec);
  const fmt = { ...ctx.fmt, currency: t.currency };
  const options = await txFormOptions(ctx);
  const refunded = t.refunds.reduce((s, r) => s + n(r.amount), 0);

  return (
    <>
      <Link href="/transactions" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Transactions
      </Link>
      <PageHeader
        eyebrow={`${TX_TYPE_LABELS[t.type as TxType]} · ${formatDate(t.date, ctx.fmt)}`}
        title={
          <span className="flex items-center gap-3">
            {v.title} {t.isDemo && <Badge tone="warn">Demo</Badge>}
          </span>
        }
        actions={
          <>
            <ActionButton action={duplicateTransaction.bind(null, t.id)} size="md">
              <Copy className="size-4" /> Duplicate
            </ActionButton>
            <ConfirmAction
              action={async () => {
                "use server";
                const r = await deleteTransaction(t.id);
                return r.ok ? { ...r, redirect: "/transactions" } : r;
              }}
              title="Delete this transaction?"
              description={
                t.investmentTxn
                  ? "The linked investment entry will be removed too, so the holding stays consistent."
                  : "Account balances, budgets and reports will be recalculated."
              }
              variant="secondary"
              size="md"
            >
              <Trash2 className="size-4" /> Delete
            </ConfirmAction>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <EditTransaction
            options={options}
            refundable={t.type === "EXPENSE" && refunded < n(t.amount)}
            refundInitial={{
              type: "REFUND",
              accountId: t.accountId,
              refundOfId: t.id,
              refundOfLabel: `${v.title} (${formatMoney(n(t.amount), fmt)} on ${formatDate(t.date, ctx.fmt)})`,
              amount: minorToInput(n(t.amount) - refunded, t.currency),
              categoryId: t.categoryId,
              merchant: t.merchant,
            }}
            initial={{
              id: t.id,
              type: t.type as TxType,
              amount: minorToInput(t.type === "INVESTMENT_BUY" || t.type === "INVESTMENT_SELL" ? n(t.investmentTxn?.amount ?? t.amount) : n(t.amount), t.currency),
              date: t.date,
              accountId: t.accountId,
              toAccountId: t.toAccountId,
              toAmount: t.toAmount != null ? minorToInput(n(t.toAmount)) : "",
              categoryId: t.categoryId,
              merchant: t.merchant,
              paymentMethod: t.paymentMethod,
              description: t.description,
              notes: t.notes,
              tags: t.tags.map((x) => x.tag.name).join(", "),
              principalAmount: t.principalAmount != null ? minorToInput(n(t.principalAmount)) : "",
              interestAmount: t.interestAmount != null ? minorToInput(n(t.interestAmount)) : "",
              loanId: t.loanId,
              refundOfId: t.refundOfId,
              holdingId: t.investmentTxn?.holdingId,
              quantity: t.investmentTxn?.quantity,
              price: t.investmentTxn?.price,
              fees: t.investmentTxn ? minorToInput(n(t.investmentTxn.fees)) : "",
            }}
          />
          <Card>
            <CardHeader title="Receipts & attachments" />
            <div className="px-5 pb-5">
              <Attachments
                transactionId={t.id}
                items={t.attachments.map((a) => ({ id: a.id, filename: a.filename, size: a.size, mimeType: a.mimeType, createdAt: a.createdAt.toISOString(), description: a.description }))}
              />
            </div>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Details" />
          <div className="divide-y divide-line px-5 pb-4">
            <KV k="Amount" v={<span className={v.tone === "pos" ? "text-pos" : ""}>{v.amountText}</span>} />
            <KV k="Type" v={TX_TYPE_LABELS[t.type as TxType]} />
            <KV k="Date" v={formatDate(t.date, ctx.fmt)} />
            <KV k="Account" v={<Link href={`/accounts/${t.accountId}`} className="hover:underline">{accountName(ctx, t.accountId)}</Link>} />
            {t.toAccountId && <KV k="To account" v={<Link href={`/accounts/${t.toAccountId}`} className="hover:underline">{accountName(ctx, t.toAccountId)}</Link>} />}
            {t.toAmount != null && <KV k="Amount received" v={formatMoney(n(t.toAmount), { ...ctx.fmt, currency: ctx.accountById.get(t.toAccountId!)?.currency ?? t.currency })} />}
            {t.categoryId && <KV k="Category" v={categoryLabel(ctx, t.categoryId)} />}
            {t.paymentMethod && <KV k="Payment method" v={PAYMENT_METHOD_LABELS[t.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? t.paymentMethod} />}
            {t.principalAmount != null && <KV k="Principal" v={formatMoney(n(t.principalAmount), fmt)} />}
            {t.interestAmount != null && <KV k="Interest" v={formatMoney(n(t.interestAmount), fmt)} />}
            {t.loan && <KV k="Loan" v={<Link href={`/wealth/loans/${t.loan.id}`} className="hover:underline">{t.loan.name}</Link>} />}
            {t.investmentTxn && (
              <>
                <KV k="Holding" v={<Link href={`/investments/${t.investmentTxn.holdingId}`} className="hover:underline">{t.investmentTxn.holding.name}</Link>} />
                {t.investmentTxn.quantity && <KV k="Units" v={formatNumber(t.investmentTxn.quantity, ctx.fmt)} />}
                {t.investmentTxn.price && <KV k="Price / unit" v={formatNumber(t.investmentTxn.price, ctx.fmt)} />}
              </>
            )}
            {t.refundOf && <KV k="Refund of" v={<Link href={`/transactions/${t.refundOf.id}`} className="hover:underline">{t.refundOf.merchant ?? t.refundOf.description ?? "expense"}</Link>} />}
            {refunded > 0 && <KV k="Refunded so far" v={formatMoney(refunded, fmt)} />}
            {t.recurringRule && <KV k="Recurring" v={<Link href="/recurring" className="hover:underline">{t.recurringRule.name}</Link>} />}
            {t.importBatch && <KV k="Imported from" v={t.importBatch.filename} />}
            <KV k="Cleared" v={t.cleared ? "Yes (reconciled)" : "No"} />
            <KV k="ID" v={<span className="font-mono text-[11px]">{t.id}</span>} />
            <KV k="Created" v={t.createdAt.toLocaleString("en-IN")} />
            <KV k="Updated" v={t.updatedAt.toLocaleString("en-IN")} />
          </div>
        </Card>
      </div>
    </>
  );
}
