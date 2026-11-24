import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { accountName, categoryLabel } from "@/lib/server/data";
import { nextDue, ruleInitial, ruleOptions } from "@/lib/server/rules-view";
import { FREQUENCY_LABELS, monthlyEquivalent } from "@/lib/finance/recurring";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ActionButton, ConfirmAction, ModalForm } from "@/components/ui/modal";
import { RuleFields } from "@/components/rule-fields";
import { deleteRule, saveRule, toggleRule } from "./actions";

export const metadata = { title: "Recurring" };

const KIND_LABEL: Record<string, string> = { BILL: "Bill", SUBSCRIPTION: "Subscription", EMI: "EMI", INCOME: "Income", TRANSFER: "Transfer", INVESTMENT: "Investment", OTHER: "Other" };

export default async function RecurringPage() {
  const ctx = await pageCtx();
  const opts = ruleOptions(ctx);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const active = ctx.rules.filter((r) => r.active);
  const monthlyIn = active.filter((r) => r.txType === "INCOME").reduce((s, r) => s + monthlyEquivalent(r.amount, r), 0);
  const monthlyOut = active.filter((r) => r.txType !== "INCOME" && r.txType !== "TRANSFER").reduce((s, r) => s + monthlyEquivalent(r.amount, r), 0);
  const monthlyTransfers = active.filter((r) => r.txType === "TRANSFER").reduce((s, r) => s + monthlyEquivalent(r.amount, r), 0);

  return (
    <>
      <PageHeader
        title="Recurring transactions"
        description="Salary, rent, EMIs, subscriptions and standing transfers. Auto-post schedules record themselves when due; others remind you."
        actions={
          <ModalForm trigger={<><Plus className="size-4" /> New schedule</>} triggerVariant="primary" title="New recurring schedule" action={saveRule} size="lg" submitLabel="Create schedule">
            <RuleFields options={opts} />
          </ModalForm>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active schedules" value={String(active.length)} hint={`${ctx.rules.length - active.length} paused`} />
        <Stat label="Recurring income / month" value={f(monthlyIn)} />
        <Stat label="Recurring outflows / month" value={f(monthlyOut)} tooltip="Bills, subscriptions and EMIs converted to a monthly equivalent." />
        <Stat label="Standing transfers / month" value={f(monthlyTransfers)} />
      </div>
      <Card>
        {ctx.rules.length === 0 ? (
          <EmptyState icon={<Repeat className="size-5" />} title="No recurring schedules" description="Add salary, rent, EMIs and subscriptions to get reminders, auto-posting and cash-flow projections." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Schedule</Th>
                <Th>Account</Th>
                <Th>Next due</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {ctx.rules.map((r) => {
                const nd = nextDue(ctx, r);
                return (
                  <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                    <Td>
                      <div className="flex items-center gap-2 font-medium">
                        {r.name}
                        <Badge tone={r.txType === "INCOME" ? "pos" : r.kind === "SUBSCRIPTION" ? "ai" : "neutral"}>{KIND_LABEL[r.kind] ?? r.kind}</Badge>
                        {r.autoPost && <Badge tone="info">Auto-post</Badge>}
                        {!r.active && <Badge>Paused</Badge>}
                        {r.isDemo && <Badge tone="warn">Demo</Badge>}
                      </div>
                      <div className="text-[11.5px] text-muted">{r.categoryId ? categoryLabel(ctx, r.categoryId) : r.toAccountId ? `→ ${accountName(ctx, r.toAccountId)}` : ""}</div>
                    </Td>
                    <Td className="text-fg-2">
                      {r.interval > 1 ? `Every ${r.interval} × ` : ""}
                      {FREQUENCY_LABELS[r.frequency]}
                      {r.endDate && <span className="block text-[11.5px] text-muted">until {formatDate(r.endDate, ctx.fmt)}</span>}
                    </Td>
                    <Td className="text-fg-2">{accountName(ctx, r.accountId)}</Td>
                    <Td className="num">{nd ? formatDate(nd, ctx.fmt) : "—"}</Td>
                    <Td align="right" className={r.txType === "INCOME" ? "text-pos" : ""}>
                      {formatMoney(r.amount, { ...ctx.fmt, currency: r.currency })}
                    </Td>
                    <Td align="right">
                      <div className="flex justify-end gap-1">
                        <ModalForm trigger={<Pencil className="size-3.5" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-8" title={`Edit “${r.name}”`} action={saveRule} size="lg" resetOnSuccess={false}>
                          <RuleFields options={opts} initial={ruleInitial(r)} />
                        </ModalForm>
                        <ActionButton action={toggleRule.bind(null, r.id, !r.active)} variant="ghost" size="icon" className="size-8" title={r.active ? "Pause" : "Resume"}>
                          {r.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                        </ActionButton>
                        <ConfirmAction action={deleteRule.bind(null, r.id)} title={`Delete “${r.name}”?`} description="Future reminders and auto-posting stop. Transactions already posted are kept." size="icon" className="size-8">
                          <Trash2 className="size-3.5" />
                        </ConfirmAction>
                      </div>
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
