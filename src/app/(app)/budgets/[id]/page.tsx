import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { pageCtx, param, type SP } from "@/lib/server/page";
import { loadBudgets } from "@/lib/server/budgets";
import { categoryLabel, categoryColor } from "@/lib/server/data";
import { budgetStatus, BUDGET_METHOD_LABELS, periodWindow, previousWindow } from "@/lib/finance/budget";
import { addDays, isISODate } from "@/lib/finance/dates";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, ProgressBar, Stat, Table, Td, Th, btnClass } from "@/components/ui/core";
import { ActionButton, ConfirmAction } from "@/components/ui/modal";
import { ChartFrame, ColumnChart } from "@/components/charts";
import { deleteBudget, toggleBudget } from "../actions";

const LEVEL_BADGE: Record<string, { tone: "pos" | "info" | "warn" | "neg"; text: string }> = {
  ok: { tone: "pos", text: "On track" },
  "50": { tone: "info", text: "50%+" },
  "75": { tone: "warn", text: "75%+" },
  "90": { tone: "warn", text: "90%+" },
  "100": { tone: "neg", text: "Over" },
};

export default async function BudgetDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await pageCtx();
  const b = (await loadBudgets(ctx.userId)).find((x) => x.id === id);
  if (!b) notFound();
  const atParam = param(sp, "at");
  const at = atParam && isISODate(atParam) ? atParam : ctx.today;
  const s = budgetStatus(b, ctx.txs, ctx.categories, ctx.today, at);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const prevW = previousWindow(b, s.window);
  const nextAt = addDays(s.window.to, 1);
  const isCurrent = ctx.today >= s.window.from && ctx.today <= s.window.to;

  // Performance: last 6 periods
  const perf: { x: string; planned: number; actual: number }[] = [];
  let w: { from: string; to: string } | null = periodWindow(b, ctx.today);
  for (let i = 0; i < 6 && w && w.to >= b.startDate; i++) {
    const st = budgetStatus({ ...b, rollover: false }, ctx.txs, ctx.categories, ctx.today, w.from);
    perf.unshift({ x: w.from, planned: st.planned, actual: st.actual });
    w = previousWindow(b, w);
  }

  return (
    <>
      <Link href="/budgets" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Budgets
      </Link>
      <PageHeader
        eyebrow={`${BUDGET_METHOD_LABELS[b.method]} · ${b.period.toLowerCase()}${b.rollover ? " · rollover" : ""}`}
        title={
          <span className="flex items-center gap-2">
            {b.name} {!b.active && <Badge>Archived</Badge>} {b.isDemo && <Badge tone="warn">Demo</Badge>}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/budgets/${b.id}/edit`}>
              <Pencil className="size-4" /> Edit
            </LinkButton>
            <ActionButton action={toggleBudget.bind(null, b.id, !b.active)} size="md">
              {b.active ? <><Archive className="size-4" /> Archive</> : <><ArchiveRestore className="size-4" /> Activate</>}
            </ActionButton>
            <ConfirmAction action={deleteBudget.bind(null, b.id)} title={`Delete “${b.name}”?`} description="The plan is deleted. Your transactions are not affected." variant="secondary" size="md">
              <Trash2 className="size-4" /> Delete
            </ConfirmAction>
          </>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        {prevW && prevW.to >= b.startDate && (
          <Link className={btnClass("secondary", "icon")} href={`/budgets/${b.id}?at=${prevW.from}`} aria-label="Previous period">
            <ChevronLeft className="size-4" />
          </Link>
        )}
        <span className="text-[13.5px] font-medium">
          {formatDate(s.window.from, ctx.fmt)} – {formatDate(s.window.to, ctx.fmt)}
        </span>
        {b.period !== "CUSTOM" && nextAt <= addDays(ctx.today, 366) && (
          <Link className={btnClass("secondary", "icon")} href={`/budgets/${b.id}?at=${nextAt}`} aria-label="Next period">
            <ChevronRight className="size-4" />
          </Link>
        )}
        {!isCurrent && (
          <Link href={`/budgets/${b.id}`} className="text-[12.5px] text-accent hover:underline">
            Current period
          </Link>
        )}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Planned" value={f(s.planned)} hint={b.rollover ? `available ${f(s.available)}` : undefined} />
        <Stat label="Spent" value={f(s.actual)} hint={formatPct(s.utilization, 0)} />
        <Stat label={s.remaining < 0 ? "Overspent" : "Remaining"} value={f(Math.abs(s.remaining))} />
        <Stat label="Daily allowance" value={isCurrent && s.daysLeft > 0 ? f(Math.max(0, Math.floor(s.remaining / s.daysLeft))) : "—"} hint={isCurrent ? `${s.daysLeft} days left` : "period not current"} />
        <Stat label="Projected" value={f(s.projected)} hint={isCurrent ? "at current daily pace" : "actual for period"} tooltip="Spent so far ÷ days elapsed × days in period." />
      </div>
      {s.unassigned != null && (
        <Card className="mb-4 p-4 text-[13px]">
          Zero-based check: {s.unassigned === 0 ? <span className="font-medium text-pos">every rupee of {f(b.expectedIncome ?? s.income)} is assigned.</span> : s.unassigned > 0 ? <span className="font-medium text-warn">{f(s.unassigned)} of expected income is unassigned.</span> : <span className="font-medium text-neg">plan exceeds expected income by {f(-s.unassigned)}.</span>}
        </Card>
      )}
      {b.method === "FIFTY_THIRTY_TWENTY" && (
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          {s.groups
            .filter((g) => g.group !== "UNGROUPED")
            .map((g) => (
              <Card key={g.group} className="p-4">
                <p className="text-[12px] font-medium text-fg-2">{g.group === "NEEDS" ? "Needs" : g.group === "WANTS" ? "Wants" : "Savings & debt"} · target {g.targetPct}% of income</p>
                <p className="num mt-1 text-[18px] font-semibold">{formatPct(g.actualPct, 0)}</p>
                <p className="text-[12px] text-muted">
                  {f(g.actual)} spent · {f(g.planned)} planned
                </p>
              </Card>
            ))}
        </div>
      )}
      <Card className="mb-4">
        <CardHeader title="Categories" subtitle={`Unbudgeted spending this period: ${f(s.unbudgetedSpending)}`} />
        <Table>
          <thead>
            <tr>
              <Th>Category</Th>
              <Th align="right">Planned</Th>
              {b.rollover && <Th align="right">Rollover</Th>}
              <Th align="right">Spent</Th>
              <Th align="right">Remaining</Th>
              <Th>Utilization</Th>
              <Th align="right">Daily left</Th>
              <Th align="right">Projected</Th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.lineId}>
                <Td>
                  <Link href={`/transactions?category=${l.categoryId}&range=custom&from=${s.window.from}&to=${s.window.to}`} className="flex items-center gap-2 font-medium hover:underline">
                    <span className="size-2 rounded-full" style={{ background: categoryColor(ctx, l.categoryId) }} />
                    {categoryLabel(ctx, l.categoryId)}
                    {l.isLimit && <Badge tone="neg">Limit</Badge>}
                  </Link>
                </Td>
                <Td align="right">{f(l.planned)}</Td>
                {b.rollover && <Td align="right" className={l.rolloverIn < 0 ? "text-neg" : "text-fg-2"}>{formatMoney(l.rolloverIn, ctx.fmt, { sign: true })}</Td>}
                <Td align="right">{f(l.actual)}</Td>
                <Td align="right" className={l.remaining < 0 ? "text-neg" : ""}>{f(l.remaining)}</Td>
                <Td className="min-w-[160px]">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={l.utilization} className="flex-1" />
                    <Badge tone={LEVEL_BADGE[l.level].tone}>{LEVEL_BADGE[l.level].text}</Badge>
                  </div>
                </Td>
                <Td align="right" className="text-fg-2">{isCurrent && l.dailyAllowance != null ? f(l.dailyAllowance) : "—"}</Td>
                <Td align="right" className={l.projected > l.available ? "text-neg" : "text-fg-2"}>{f(l.projected)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <ChartFrame
        title="Budget performance"
        subtitle="Planned vs actual, last periods (without rollover)"
        legend={[{ label: "Planned", slot: 0 }, { label: "Actual", slot: 1 }]}
        table={{ columns: ["Period start", "Planned", "Actual", "Variance"], rows: perf.map((p) => [formatDate(p.x, ctx.fmt), f(p.planned), f(p.actual), f(p.planned - p.actual)]) }}
      >
        <ColumnChart prefs={ctx.fmt} xKey="x" data={perf} series={[{ key: "planned", name: "Planned", slot: 0 }, { key: "actual", name: "Actual", slot: 1 }]} xFormat={b.period === "MONTHLY" ? "month" : "date"} height={220} />
      </ChartFrame>
      <p className="mt-3 text-[12px] text-muted">Budgets measure net spending: expenses minus refunds plus loan interest. Transfers and investments are excluded.</p>
    </>
  );
}
