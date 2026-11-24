import Link from "next/link";
import { PiggyBank, Plus } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { loadBudgets } from "@/lib/server/budgets";
import { budgetStatus, BUDGET_METHOD_LABELS } from "@/lib/finance/budget";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, EmptyState, LinkButton, PageHeader, ProgressBar } from "@/components/ui/core";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage() {
  const ctx = await pageCtx();
  const budgets = await loadBudgets(ctx.userId);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  return (
    <>
      <PageHeader
        title="Budgets"
        description="Actual spending is calculated live from the ledger, including subcategories and net of refunds. Alerts fire at 50%, 75%, 90% and 100%."
        actions={
          <LinkButton href="/budgets/new" variant="primary">
            <Plus className="size-4" /> New budget
          </LinkButton>
        }
      />
      {budgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PiggyBank className="size-5" />}
            title="No budgets yet"
            description="Plan spending by category, use zero-based or 50/30/20 budgeting, or run envelopes with rollover."
            action={<LinkButton href="/budgets/new" variant="primary">Plan a budget</LinkButton>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {budgets.map((b) => {
            const s = budgetStatus(b, ctx.txs, ctx.categories, ctx.today);
            const over = s.lines.filter((l) => l.level === "100").length;
            const warn = s.lines.filter((l) => l.level === "90" || l.level === "75").length;
            return (
              <Link key={b.id} href={`/budgets/${b.id}`} className={b.active ? "" : "opacity-60"}>
                <Card className="h-full p-5 transition-shadow hover:shadow-pop">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[15px] font-semibold">{b.name}</p>
                      <p className="text-[12px] text-muted">
                        {BUDGET_METHOD_LABELS[b.method]} · {b.period.toLowerCase()} · {formatDate(s.window.from, ctx.fmt)} – {formatDate(s.window.to, ctx.fmt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {!b.active && <Badge>Archived</Badge>}
                      {b.rollover && <Badge tone="info">Rollover</Badge>}
                      {b.isDemo && <Badge tone="warn">Demo</Badge>}
                      {over > 0 && <Badge tone="neg">{over} over</Badge>}
                      {warn > 0 && <Badge tone="warn">{warn} near limit</Badge>}
                    </div>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="num text-[20px] font-semibold">{f(s.actual)}</span>
                    <span className="num text-[13px] text-fg-2">of {f(s.available)}</span>
                  </div>
                  <ProgressBar value={s.utilization} className="mt-2" label={`${b.name} utilization`} />
                  <div className="mt-2 flex justify-between text-[12px] text-muted">
                    <span>{formatPct(s.utilization, 0)} used · {s.daysLeft} days left</span>
                    <span className={s.remaining < 0 ? "text-neg" : ""}>{s.remaining < 0 ? `${f(-s.remaining)} over` : `${f(s.remaining)} left`}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">Projected at current pace: {f(s.projected)}</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
