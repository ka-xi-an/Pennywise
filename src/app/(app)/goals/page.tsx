import { CheckCircle2, Pause, Pencil, Play, Plus, Target, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { GOAL_TYPE_LABELS } from "@/lib/finance/goals";
import { formatDate, formatMoney, formatPct, minorToInput } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, Stat } from "@/components/ui/core";
import { ActionButton, ConfirmAction, ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { GoalFields } from "@/components/goal-fields";
import { addContribution, deleteGoal, saveGoal, setGoalStatus } from "./actions";

export const metadata = { title: "Financial goals" };

const PRIORITY = { 1: "High", 2: "Medium", 3: "Low" } as Record<number, string>;
const MODE = { MANUAL: "Recorded contributions", ACCOUNTS: "Linked account balances", NET_WORTH: "Net worth" } as Record<string, string>;

export default async function GoalsPage() {
  const ctx = await pageCtx();
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const sym = ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency;
  const accounts = ctx.accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, name: a.name, type: a.type }));
  const active = ctx.goals.filter((g) => g.status === "ACTIVE");
  const onTrack = active.filter((g) => g.progress.onTrack).length;

  return (
    <>
      <PageHeader
        title="Financial goals"
        description="Progress comes from real balances or contributions you record. Projections use your planned monthly contribution and (optional) return assumption."
        actions={
          <ModalForm trigger={<><Plus className="size-4" /> New goal</>} triggerVariant="primary" title="New goal" action={saveGoal} size="lg">
            <GoalFields accounts={accounts} sym={sym} />
          </ModalForm>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active goals" value={String(active.length)} />
        <Stat label="On track" value={`${onTrack} / ${active.filter((g) => g.targetDate).length}`} hint="goals with a target date" />
        <Stat label="Total target" value={f(active.reduce((s, g) => s + g.targetAmount, 0))} />
        <Stat label="Planned monthly" value={f(active.reduce((s, g) => s + g.monthlyContribution, 0))} />
      </div>
      {!ctx.goals.length ? (
        <Card>
          <EmptyState icon={<Target className="size-5" />} title="No goals yet" description="Emergency fund, house, car, vacation, education, retirement, debt freedom or a net-worth milestone." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ctx.goals.map((g) => {
            const p = g.progress;
            return (
              <Card key={g.id} className={`flex flex-col p-5 ${g.status !== "ACTIVE" ? "opacity-70" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold">{g.name}</p>
                    <p className="text-[12px] text-muted">
                      {GOAL_TYPE_LABELS[g.type]} · {PRIORITY[g.priority]} priority
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {g.status === "ACHIEVED" && <Badge tone="pos">Achieved</Badge>}
                    {g.status === "PAUSED" && <Badge>Paused</Badge>}
                    {g.status === "ACTIVE" && p.onTrack === true && <Badge tone="pos">On track</Badge>}
                    {g.status === "ACTIVE" && p.onTrack === false && <Badge tone="neg">Behind</Badge>}
                    {g.isDemo && <Badge tone="warn">Demo</Badge>}
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="num text-[20px] font-semibold">{f(g.current)}</span>
                  <span className="num text-[13px] text-fg-2">of {f(g.targetAmount)}</span>
                </div>
                <ProgressBar value={p.pct} tone={p.onTrack === false ? "accent" : "pos"} className="mt-2" label={`${g.name} progress`} />
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                  <dt className="text-muted">Progress</dt>
                  <dd className="num text-right">{formatPct(p.pct, 1)}</dd>
                  <dt className="text-muted">Remaining</dt>
                  <dd className="num text-right">{f(p.remaining)}</dd>
                  <dt className="text-muted">Target date</dt>
                  <dd className="text-right">{g.targetDate ? formatDate(g.targetDate, ctx.fmt) : "—"}</dd>
                  <dt className="text-muted">Planned / month</dt>
                  <dd className="num text-right">{f(g.monthlyContribution)}</dd>
                  <dt className="text-muted">Required / month</dt>
                  <dd className={`num text-right ${p.required != null && p.required > g.monthlyContribution ? "text-neg" : ""}`}>{p.required != null ? f(p.required) : "—"}</dd>
                  <dt className="text-muted">Projected completion</dt>
                  <dd className="text-right">{p.remaining === 0 ? "Done" : p.projectedDate ? formatDate(p.projectedDate, ctx.fmt) : "Add a contribution"}</dd>
                  <dt className="text-muted">Tracking</dt>
                  <dd className="text-right">{MODE[g.trackingMode]}</dd>
                </dl>
                {g.expectedReturn && <p className="mt-2 text-[11px] text-muted">Projection assumes {g.expectedReturn}% p.a. return (your assumption).</p>}
                <div className="mt-auto flex flex-wrap gap-1 border-t border-line pt-3">
                  {g.trackingMode === "MANUAL" && g.status === "ACTIVE" && (
                    <ModalForm trigger={<><Plus className="size-3.5" /> Contribution</>} triggerSize="sm" title={`Add to ${g.name}`} description="Records progress toward the goal. To move money, also record a transfer." action={addContribution}>
                      <input type="hidden" name="goalId" value={g.id} />
                      <Field label="Amount (negative for a withdrawal)" name="amount">
                        <MoneyInput name="amount" currencySymbol={sym} defaultValue={minorToInput(g.monthlyContribution || 0)} />
                      </Field>
                      <Field label="Date" name="date">
                        <Input name="date" type="date" defaultValue={ctx.today} />
                      </Field>
                      <Field label="Note" name="note">
                        <Input name="note" />
                      </Field>
                    </ModalForm>
                  )}
                  <ModalForm trigger={<Pencil className="size-3.5" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-8" title={`Edit ${g.name}`} action={saveGoal} size="lg" resetOnSuccess={false}>
                    <GoalFields
                      accounts={accounts}
                      sym={sym}
                      initial={{
                        id: g.id,
                        name: g.name,
                        type: g.type,
                        targetAmount: minorToInput(g.targetAmount),
                        targetDate: g.targetDate,
                        priority: g.priority,
                        monthlyContribution: minorToInput(g.monthlyContribution),
                        trackingMode: g.trackingMode,
                        startingAmount: minorToInput(g.startingAmount),
                        expectedReturn: g.expectedReturn,
                        accountIds: g.accountIds,
                        notes: g.notes,
                      }}
                    />
                  </ModalForm>
                  {g.status === "ACTIVE" ? (
                    <>
                      <ActionButton action={setGoalStatus.bind(null, g.id, "ACHIEVED")} variant="ghost" size="icon" className="size-8" title="Mark achieved">
                        <CheckCircle2 className="size-3.5" />
                      </ActionButton>
                      <ActionButton action={setGoalStatus.bind(null, g.id, "PAUSED")} variant="ghost" size="icon" className="size-8" title="Pause">
                        <Pause className="size-3.5" />
                      </ActionButton>
                    </>
                  ) : (
                    <ActionButton action={setGoalStatus.bind(null, g.id, "ACTIVE")} variant="ghost" size="icon" className="size-8" title="Reactivate">
                      <Play className="size-3.5" />
                    </ActionButton>
                  )}
                  <ConfirmAction action={deleteGoal.bind(null, g.id)} title={`Delete “${g.name}”?`} description="The goal and its contribution log are deleted. Accounts and transactions are not affected." size="icon" className="ml-auto size-8">
                    <Trash2 className="size-3.5" />
                  </ConfirmAction>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
