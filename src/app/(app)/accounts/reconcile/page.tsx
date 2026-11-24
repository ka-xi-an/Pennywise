import { pageCtx, param, type SP } from "@/lib/server/page";
import { db, n } from "@/lib/server/db";
import { balanceEffects } from "@/lib/finance/ledger";
import { txView } from "@/lib/server/display";
import { formatDate, formatMoney } from "@/lib/format";
import { Card, CardHeader, PageHeader, Table, Td, Th, Badge } from "@/components/ui/core";
import { ParamSelect } from "@/components/range-picker";
import { Reconciler } from "./reconciler";
import { Suspense } from "react";

export const metadata = { title: "Reconciliation" };

export default async function ReconcilePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const eligible = ctx.accounts.filter((a) => a.type !== "LOAN" && a.status === "ACTIVE");
  const accountId = param(sp, "account") ?? eligible[0]?.id;
  const a = accountId ? ctx.accountById.get(accountId) : undefined;
  const rows = a
    ? await db.transaction.findMany({
        where: { userId: ctx.userId, OR: [{ accountId: a.id }, { toAccountId: a.id }] },
        select: { id: true, cleared: true },
      })
    : [];
  const clearedSet = new Set(rows.filter((r) => r.cleared).map((r) => r.id));
  const items = a
    ? ctx.txsNative
        .filter((t) => (t.accountId === a.id || t.toAccountId === a.id) && !clearedSet.has(t.id))
        .map((t) => {
          const effect = balanceEffects(t).find((e) => e.accountId === a.id)?.amount ?? 0;
          const v = txView(ctx, t);
          return { id: t.id, date: t.date, dateText: formatDate(t.date, ctx.fmt), title: v.title, effect };
        })
        .sort((x, y) => x.date.localeCompare(y.date))
    : [];
  let clearedBalance = a && a.openingDate <= ctx.today ? a.openingBalance : 0;
  if (a)
    for (const t of ctx.txsNative)
      if (clearedSet.has(t.id)) clearedBalance += balanceEffects(t).find((e) => e.accountId === a.id)?.amount ?? 0;
  const history = a ? await db.reconciliation.findMany({ where: { accountId: a.id, userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 10 }) : [];

  return (
    <>
      <PageHeader
        title="Reconciliation"
        description="Match your records against a bank or card statement. Tick the transactions that appear on the statement; the difference should reach zero."
        actions={
          <Suspense>
            <ParamSelect name="account" label="Account" value={accountId ?? ""} options={eligible.map((x) => ({ value: x.id, label: x.name }))} />
          </Suspense>
        }
      />
      {!a ? (
        <Card className="p-8 text-center text-[13px] text-muted">Add an account to reconcile.</Card>
      ) : (
        <>
          <Reconciler
            key={a.id}
            accountId={a.id}
            accountName={a.name}
            isCard={a.type === "CREDIT_CARD"}
            currency={a.currency}
            locale={ctx.prefs.locale}
            dateFormat={ctx.prefs.dateFormat}
            today={ctx.today}
            clearedBalance={clearedBalance}
            items={items}
          />
          <Card className="mt-4">
            <CardHeader title="Reconciliation history" />
            <Table>
              <thead>
                <tr>
                  <Th>Statement date</Th>
                  <Th align="right">Statement balance</Th>
                  <Th align="right">Cleared balance</Th>
                  <Th align="right">Difference</Th>
                  <Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td>{formatDate(h.statementDate, ctx.fmt)}</Td>
                    <Td align="right">{formatMoney(n(h.statementBalance), { ...ctx.fmt, currency: a.currency })}</Td>
                    <Td align="right">{formatMoney(n(h.clearedBalance), { ...ctx.fmt, currency: a.currency })}</Td>
                    <Td align="right">{formatMoney(n(h.difference), { ...ctx.fmt, currency: a.currency })}</Td>
                    <Td>{n(h.difference) === 0 ? <Badge tone="pos">Matched</Badge> : h.adjustmentTxId ? <Badge tone="info">Adjusted</Badge> : <Badge tone="warn">Open difference</Badge>}</Td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <Td colSpan={5} className="py-6 text-center text-muted">
                      Not reconciled yet.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
        </>
      )}
    </>
  );
}
