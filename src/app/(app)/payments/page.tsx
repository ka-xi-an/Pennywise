import Link from "next/link";
import { CalendarDays, Check, Plus, SkipForward, Undo2, CalendarClock } from "lucide-react";
import { pageCtx, param, type SP } from "@/lib/server/page";
import { accountName } from "@/lib/server/data";
import { occurrencesView, ruleOptions } from "@/lib/server/rules-view";
import { addDays } from "@/lib/finance/dates";
import { annualCost, FREQUENCY_LABELS, monthlyEquivalent } from "@/lib/finance/recurring";
import { formatDate, formatMoney, minorToInput } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Stat, Table, Tabs, Td, Th } from "@/components/ui/core";
import { ActionButton, ConfirmAction, ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";
import { RuleFields, BILL_TYPES } from "@/components/rule-fields";
import { markOccurrencePaid, saveRule, skipOccurrence, undoOccurrence } from "../recurring/actions";

export const metadata = { title: "Bills & subscriptions" };

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const kind = param(sp, "kind") ?? "ALL";
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const payRules = ctx.rules.filter((r) => r.txType !== "INCOME" && (kind === "ALL" ? ["BILL", "SUBSCRIPTION", "EMI", "OTHER", "TRANSFER"].includes(r.kind) : r.kind === kind));
  const active = payRules.filter((r) => r.active);
  const occ = occurrencesView(ctx, active, addDays(ctx.today, -45), addDays(ctx.today, 45));
  const overdue = occ.filter((o) => o.state === "OVERDUE" && !o.rule.autoPost);
  const upcoming = occ.filter((o) => o.state === "DUE_SOON" || o.state === "UPCOMING");
  const history = occurrencesView(ctx, payRules, addDays(ctx.today, -365), ctx.today)
    .filter((o) => o.state === "PAID" || o.state === "SKIPPED")
    .reverse()
    .slice(0, 25);
  const subs = ctx.rules.filter((r) => r.kind === "SUBSCRIPTION" && r.active);
  const subsAnnual = subs.reduce((s, r) => s + annualCost(r.amount, r), 0);
  const monthlyCommitted = active.filter((r) => r.txType !== "TRANSFER").reduce((s, r) => s + monthlyEquivalent(r.amount, r), 0);
  const opts = ruleOptions(ctx);
  const payable = ctx.accounts.filter((a) => a.status === "ACTIVE" && a.type !== "LOAN");

  const PayForm = ({ o }: { o: (typeof occ)[number] }) => (
    <ModalForm trigger={<><Check className="size-3.5" /> Mark paid</>} triggerSize="sm" title={`Pay ${o.rule.name}`} description={`Due ${formatDate(o.due, ctx.fmt)}. Posts the transaction to your ledger.`} action={markOccurrencePaid} submitLabel="Record payment">
      <input type="hidden" name="ruleId" value={o.rule.id} />
      <input type="hidden" name="dueDate" value={o.due} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount paid" name="amount">
          <MoneyInput name="amount" currencySymbol={opts.sym} defaultValue={minorToInput(o.rule.amount)} />
        </Field>
        <Field label="Paid on" name="paidDate">
          <Input name="paidDate" type="date" defaultValue={ctx.today} />
        </Field>
        <Field label="Paid from" name="accountId" className="sm:col-span-2">
          <Select name="accountId" defaultValue={o.rule.accountId}>
            {payable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </ModalForm>
  );

  const Row = ({ o }: { o: (typeof occ)[number] }) => (
    <tr>
      <Td>
        <div className="font-medium">{o.rule.name}</div>
        <div className="text-[11.5px] text-muted">
          {o.rule.billType ? BILL_TYPES[o.rule.billType] ?? o.rule.billType : o.rule.kind} · {accountName(ctx, o.rule.accountId)}
        </div>
      </Td>
      <Td className="num">{formatDate(o.due, ctx.fmt)}</Td>
      <Td>
        {o.state === "OVERDUE" ? (
          <Badge tone="neg">Overdue {Math.round((Date.parse(ctx.today) - Date.parse(o.due)) / 86400000)}d</Badge>
        ) : o.state === "DUE_SOON" ? (
          <Badge tone="warn">Due soon</Badge>
        ) : (
          <Badge>Upcoming</Badge>
        )}
        {o.rule.autoPost && <Badge tone="info" className="ml-1">Auto-posts</Badge>}
      </Td>
      <Td align="right">{f(o.rule.amount)}</Td>
      <Td align="right">
        <div className="flex justify-end gap-1">
          <PayForm o={o} />
          <ActionButton action={skipOccurrence.bind(null, o.rule.id, o.due)} variant="ghost" title="Skip this occurrence">
            <SkipForward className="size-3.5" />
          </ActionButton>
        </div>
      </Td>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="Bills & subscriptions"
        description="Upcoming and overdue payments, paid status, renewals and the true annual cost of subscriptions."
        actions={
          <>
            <LinkButton href="/payments/calendar">
              <CalendarDays className="size-4" /> Calendar
            </LinkButton>
            <ModalForm trigger={<><Plus className="size-4" /> Add bill</>} triggerVariant="primary" title="New bill or subscription" action={saveRule} size="lg">
              <RuleFields options={opts} initial={{ kind: kind === "SUBSCRIPTION" ? "SUBSCRIPTION" : kind === "EMI" ? "EMI" : "BILL" }} />
            </ModalForm>
          </>
        }
      />
      <Tabs
        active={kind}
        items={[
          { id: "ALL", label: "All payments", href: "/payments" },
          { id: "BILL", label: "Bills", href: "/payments?kind=BILL" },
          { id: "SUBSCRIPTION", label: "Subscriptions", href: "/payments?kind=SUBSCRIPTION" },
          { id: "EMI", label: "EMIs", href: "/payments?kind=EMI" },
        ]}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Overdue" value={String(overdue.length)} hint={overdue.length ? f(overdue.reduce((s, o) => s + o.rule.amount, 0)) : "Nothing late"} />
        <Stat label="Due in next 45 days" value={String(upcoming.length)} hint={f(upcoming.reduce((s, o) => s + o.rule.amount, 0))} />
        <Stat label="Committed per month" value={f(monthlyCommitted)} tooltip="Monthly equivalent of all active bills, subscriptions and EMIs." />
        <Stat label="Subscriptions per year" value={f(subsAnnual)} hint={`${subs.length} active`} />
      </div>
      {payRules.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarClock className="size-5" />} title="No bills tracked yet" description="Add rent, utilities, insurance, EMIs and subscriptions to get reminders and late-payment alerts." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            {overdue.length > 0 && (
              <Card className="border-neg/40">
                <CardHeader title={<span className="text-neg">Overdue</span>} subtitle="Not marked paid after the due date" />
                <Table>
                  <tbody>
                    {overdue.map((o) => (
                      <Row key={o.rule.id + o.due} o={o} />
                    ))}
                  </tbody>
                </Table>
              </Card>
            )}
            <Card>
              <CardHeader title="Upcoming" subtitle="Next 45 days" />
              <Table>
                <thead>
                  <tr>
                    <Th>Payment</Th>
                    <Th>Due</Th>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((o) => (
                    <Row key={o.rule.id + o.due} o={o} />
                  ))}
                  {!upcoming.length && (
                    <tr>
                      <Td colSpan={5} className="py-6 text-center text-muted">
                        Nothing due in the next 45 days.
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader title="Payment history" subtitle="Last 12 months" />
              <Table>
                <tbody>
                  {history.map((o) => (
                    <tr key={o.rule.id + o.due}>
                      <Td className="font-medium">{o.rule.name}</Td>
                      <Td className="num text-fg-2">due {formatDate(o.due, ctx.fmt)}</Td>
                      <Td>{o.state === "PAID" ? <Badge tone="pos">Paid {o.paidDate ? formatDate(o.paidDate, ctx.fmt) : ""}</Badge> : <Badge>Skipped</Badge>}</Td>
                      <Td align="right">
                        <div className="flex justify-end gap-2">
                          {o.transactionId && (
                            <Link href={`/transactions/${o.transactionId}`} className="text-[12px] text-accent hover:underline">
                              View
                            </Link>
                          )}
                          <ConfirmAction
                            action={undoOccurrence.bind(null, o.rule.id, o.due)}
                            title="Undo this payment record?"
                            description={o.transactionId ? "The transaction posted for it will be deleted and the bill will show as unpaid." : "The occurrence will show as unpaid again."}
                            confirmLabel="Undo"
                            size="sm"
                          >
                            <Undo2 className="size-3.5" />
                          </ConfirmAction>
                        </div>
                      </Td>
                    </tr>
                  ))}
                  {!history.length && (
                    <tr>
                      <Td className="py-6 text-center text-muted">No payments recorded yet.</Td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>
          </div>
          <div className="lg:col-span-4">
            <Card>
              <CardHeader title="Subscriptions" subtitle="Renewals and annual cost" />
              <ul className="divide-y divide-line">
                {subs.map((r) => {
                  const next = occurrencesView(ctx, [r], ctx.today, addDays(ctx.today, 400)).find((o) => o.state !== "PAID" && o.state !== "SKIPPED");
                  return (
                    <li key={r.id} className="px-5 py-2.5">
                      <div className="flex items-center justify-between text-[13px]">
                        <span className="font-medium">{r.name}</span>
                        <span className="num">{f(r.amount)}</span>
                      </div>
                      <div className="flex justify-between text-[11.5px] text-muted">
                        <span>
                          {FREQUENCY_LABELS[r.frequency]} · renews {next ? formatDate(next.due, ctx.fmt) : "—"}
                        </span>
                        <span>{f(annualCost(r.amount, r))}/yr</span>
                      </div>
                    </li>
                  );
                })}
                {!subs.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No subscriptions. The AI analyst can detect them from your history.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
