import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Lock, Pencil, Scale, Trash2, Unlock, Wrench } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { categoryLabel, categoryColor } from "@/lib/server/data";
import { balanceEffects, balanceHistory, dailyBalances, groupBy } from "@/lib/finance/ledger";
import { addDays, addMonths, endOfMonth, startOfMonth } from "@/lib/finance/dates";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/types";
import { formatDate, formatMoney, maskAccountNumber, minorToInput } from "@/lib/format";
import { Badge, Card, CardHeader, KV, LinkButton, PageHeader, Stat } from "@/components/ui/core";
import { ActionButton, ConfirmAction, ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Textarea } from "@/components/ui/form";
import { AccountFields } from "@/components/account-fields";
import { ChartFrame, RankedBars, TrendChart } from "@/components/charts";
import { TxList } from "@/components/tx-list";
import { adjustBalance, deleteAccount, saveAccount, setAccountStatus } from "../actions";
import { db } from "@/lib/server/db";

export default async function AccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const a = ctx.accountById.get(id);
  if (!a) notFound();
  const loan = ctx.loans.find((l) => l.accountId === id);
  if (loan) redirect(`/wealth/loans/${loan.id}`);
  const fmt = { ...ctx.fmt, currency: a.currency };
  const sym = a.currency === "INR" ? "₹" : a.currency;
  const bal = ctx.balances.get(id) ?? 0;
  const txs = ctx.txsNative.filter((t) => t.accountId === id || t.toAccountId === id);
  const month = { from: startOfMonth(ctx.today), to: endOfMonth(ctx.today) };
  let inflow = 0,
    outflow = 0;
  for (const t of txs) {
    if (t.date < month.from || t.date > month.to) continue;
    for (const e of balanceEffects(t)) if (e.accountId === id) e.amount > 0 ? (inflow += e.amount) : (outflow -= e.amount);
  }
  const monthly = balanceHistory(a, ctx.txsNative, { from: addMonths(startOfMonth(ctx.today), -11), to: ctx.today });
  const daily = dailyBalances(a, ctx.txsNative, { from: addDays(ctx.today, -89), to: ctx.today });
  const ownTxs = ctx.txsNative.filter((t) => t.accountId === id);
  const cats = groupBy(ownTxs, { from: addMonths(month.from, -2), to: month.to }, "topCategory", "expense", ctx.catIdx).slice(0, 6);
  const lastRec = await db.reconciliation.findFirst({ where: { accountId: id, userId: ctx.userId }, orderBy: { statementDate: "desc" } });
  const uncleared = await db.transaction.count({ where: { userId: ctx.userId, cleared: false, OR: [{ accountId: id }, { toAccountId: id }] } });

  return (
    <>
      <Link href="/accounts" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Accounts
      </Link>
      <PageHeader
        eyebrow={[ACCOUNT_TYPE_LABELS[a.type], a.institution, maskAccountNumber(a.maskedNumber)].filter(Boolean).join(" · ")}
        title={
          <span className="flex items-center gap-2">
            {a.name} {a.status === "CLOSED" && <Badge>Closed</Badge>} {a.isDemo && <Badge tone="warn">Demo</Badge>}
          </span>
        }
        actions={
          <>
            <ModalForm trigger={<><Pencil className="size-4" /> Edit</>} title="Edit account" action={saveAccount} size="lg" resetOnSuccess={false}>
              <AccountFields
                today={ctx.today}
                baseCurrency={ctx.prefs.baseCurrency}
                sym={sym}
                initial={{
                  id: a.id,
                  name: a.name,
                  institution: a.institution,
                  type: a.type,
                  currency: a.currency,
                  openingBalance: minorToInput(a.type === "CREDIT_CARD" ? -a.openingBalance : a.openingBalance, a.currency),
                  openingDate: a.openingDate,
                  maskedNumber: a.maskedNumber,
                  creditLimit: a.creditLimit != null ? minorToInput(a.creditLimit, a.currency) : "",
                  includeInNetWorth: a.includeInNetWorth,
                }}
              />
            </ModalForm>
            <ModalForm trigger={<><Wrench className="size-4" /> Adjust balance</>} title="Adjust balance" description="Posts an adjustment for the difference. It never counts as income or spending." action={adjustBalance}>
              <input type="hidden" name="accountId" value={a.id} />
              <Field label={a.type === "CREDIT_CARD" ? "Actual amount owed" : "Actual balance"} name="actualBalance">
                <MoneyInput name="actualBalance" currencySymbol={sym} defaultValue={minorToInput(a.type === "CREDIT_CARD" ? -bal : bal, a.currency)} />
              </Field>
              <Field label="As of" name="date">
                <Input name="date" type="date" defaultValue={ctx.today} />
              </Field>
              <Field label="Note" name="note">
                <Textarea name="note" rows={2} />
              </Field>
            </ModalForm>
            <LinkButton href={`/accounts/reconcile?account=${a.id}`}>
              <Scale className="size-4" /> Reconcile
            </LinkButton>
            <ActionButton action={setAccountStatus.bind(null, a.id, a.status === "ACTIVE" ? "CLOSED" : "ACTIVE")} size="md">
              {a.status === "ACTIVE" ? <><Lock className="size-4" /> Close</> : <><Unlock className="size-4" /> Reopen</>}
            </ActionButton>
            <ConfirmAction
              action={deleteAccount.bind(null, a.id)}
              title={`Delete “${a.name}”?`}
              description={`This permanently deletes the account and ${txs.length} transaction${txs.length === 1 ? "" : "s"} touching it — including transfers that also affect other accounts. Consider closing it instead to keep history.`}
              requireText="DELETE"
              variant="secondary"
              size="md"
            >
              <Trash2 className="size-4" /> Delete
            </ConfirmAction>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={a.type === "CREDIT_CARD" ? "Outstanding" : "Current balance"} value={formatMoney(a.type === "CREDIT_CARD" ? -bal : bal, fmt)} />
        <Stat label="In this month" value={formatMoney(inflow, fmt)} />
        <Stat label="Out this month" value={formatMoney(outflow, fmt)} />
        <Stat
          label={a.type === "CREDIT_CARD" && a.creditLimit ? "Available credit" : "Last reconciled"}
          value={a.type === "CREDIT_CARD" && a.creditLimit ? formatMoney(a.creditLimit + bal, fmt) : lastRec ? formatDate(lastRec.statementDate, ctx.fmt) : "Never"}
          hint={lastRec && Number(lastRec.difference) !== 0 ? `difference ${formatMoney(Number(lastRec.difference), fmt)}` : undefined}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <ChartFrame title="Balance history" subtitle="Daily, last 90 days" table={{ columns: ["Month end", "Balance"], rows: monthly.map((m) => [m.month, formatMoney(m.balance, fmt)]) }}>
            <TrendChart prefs={fmt} xKey="x" data={daily.map((d) => ({ x: d.date, balance: d.balance }))} series={[{ key: "balance", name: "Balance", slot: 0 }]} xFormat="date" zeroLine />
          </ChartFrame>
        </div>
        <div className="lg:col-span-4">
          <Card className="h-full">
            <CardHeader title="Spending from this account" subtitle="Last 3 months" />
            <div className="px-5 pb-5">
              {cats.length ? (
                <RankedBars prefs={fmt} rows={cats.map((c) => ({ key: c.key, label: categoryLabel(ctx, c.key), value: c.amount, color: categoryColor(ctx, c.key) }))} />
              ) : (
                <p className="text-[13px] text-muted">No spending recorded.</p>
              )}
            </div>
          </Card>
        </div>
        <div className="lg:col-span-8">
          <Card>
            <CardHeader
              title="Transactions"
              subtitle={`${txs.length} in total`}
              action={
                <Link href={`/transactions?account=${a.id}`} className="text-[12px] text-accent hover:underline">
                  Open in ledger
                </Link>
              }
            />
            <TxList ctx={ctx} txs={txs.slice(0, 25)} />
          </Card>
        </div>
        <div className="lg:col-span-4">
          <Card>
            <CardHeader title="Account details" />
            <div className="divide-y divide-line px-5 pb-4">
              <KV k="Opening balance" v={formatMoney(a.openingBalance, fmt)} />
              <KV k="Opened" v={formatDate(a.openingDate, ctx.fmt)} />
              <KV k="Currency" v={a.currency} />
              <KV k="In net worth" v={a.includeInNetWorth ? "Yes" : "No"} />
              {a.creditLimit != null && <KV k="Credit limit" v={formatMoney(a.creditLimit, fmt)} />}
              <KV k="Uncleared transactions" v={uncleared === 0 ? <span className="text-pos">None</span> : <Link href={`/accounts/reconcile?account=${a.id}`} className="text-accent hover:underline">{uncleared} to reconcile</Link>} />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
