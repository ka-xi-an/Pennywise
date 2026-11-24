import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Landmark, Plus, Sparkles, Target, Upload, Wallet } from "lucide-react";
import { pageCtx, rangeFrom, type SP } from "@/lib/server/page";
import { categoryLabel, categoryColor, keyMetrics } from "@/lib/server/data";
import { buildInsights } from "@/lib/server/insights";
import { loadBudgets } from "@/lib/server/budgets";
import { loadSnapshots } from "@/lib/server/services/snapshots";
import { cashFlowStatement, groupBy, monthlySeries, summarize, accountBalances } from "@/lib/finance/ledger";
import { addDays, addMonths, endOfMonth, monthLabel, monthsInRange, startOfMonth, formatDate as fmtD } from "@/lib/finance/dates";
import { budgetStatus } from "@/lib/finance/budget";
import { occurrencesBetween, occurrenceState } from "@/lib/finance/recurring";
import { ASSET_CLASS_LABELS } from "@/lib/finance/investments";
import { NW_GROUP_LABELS } from "@/lib/finance/networth";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/types";
import { formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, Delta, EmptyState, LinkButton, PageHeader, ProgressBar, cx } from "@/components/ui/core";
import { ChartFrame, ColumnChart, Donut, RankedBars, Sparkline, TrendChart } from "@/components/charts";
import { RangePicker } from "@/components/range-picker";
import { TxList } from "@/components/tx-list";
import { CustomizeDashboard } from "./customize";
import { QuickAddButton } from "./quick-add-button";

export const metadata = { title: "Dashboard" };

const WIDGETS = [
  { id: "kpis", label: "Key metrics", span: "lg:col-span-12" },
  { id: "networth", label: "Net worth over time", span: "lg:col-span-8" },
  { id: "insights", label: "Financial insights", span: "lg:col-span-4" },
  { id: "income-expense", label: "Income vs expenses", span: "lg:col-span-6" },
  { id: "cashflow", label: "Monthly cash flow", span: "lg:col-span-6" },
  { id: "categories", label: "Largest expense categories", span: "lg:col-span-4" },
  { id: "allocation", label: "Asset allocation", span: "lg:col-span-4" },
  { id: "investments", label: "Investment portfolio", span: "lg:col-span-4" },
  { id: "savings", label: "Savings trend", span: "lg:col-span-6" },
  { id: "budget", label: "Budget utilization", span: "lg:col-span-6" },
  { id: "recent", label: "Recent transactions", span: "lg:col-span-7" },
  { id: "bills", label: "Upcoming bills", span: "lg:col-span-5" },
  { id: "goals", label: "Goals progress", span: "lg:col-span-6" },
  { id: "accounts", label: "Account balances", span: "lg:col-span-6" },
];

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const { range, prev } = rangeFrom(sp, ctx);
  const f = (v: number, compact = false) => formatMoney(v, ctx.fmt, { compact });
  const hasData = ctx.accounts.length > 0;

  if (!hasData) {
    return (
      <>
        <PageHeader title="Dashboard" description="Your financial command center." />
        <Card>
          <EmptyState
            icon={<Landmark className="size-5" />}
            title="Start by adding an account"
            description="Accounts hold your balances. Every transaction, budget, report and net-worth figure is calculated from them — nothing is estimated or invented."
            action={
              <>
                <LinkButton href="/accounts" variant="primary">
                  <Plus className="size-4" /> Add account
                </LinkButton>
                <LinkButton href="/settings/data">Load demo data</LinkButton>
              </>
            }
          />
        </Card>
      </>
    );
  }

  const cur = summarize(ctx.txs, range);
  const before = summarize(ctx.txs, prev);
  const baseAccounts = ctx.accounts.filter((a) => a.currency === ctx.prefs.baseCurrency);
  const cfNow = cashFlowStatement(baseAccounts, ctx.txs, range);
  const cfPrev = cashFlowStatement(baseAccounts, ctx.txs, prev);
  const netCF = cfNow.netChange - cfNow.newAccountOpenings;
  const netCFPrev = cfPrev.netChange - cfPrev.newAccountOpenings;
  const metrics = keyMetrics(ctx);

  // Previous-period balances: snapshot at the month end before the range (if recorded), ledger for cash.
  const snapshots = await loadSnapshots(ctx.userId);
  const prevEnd = addDays(range.from, -1);
  const prevSnap = [...snapshots].reverse().find((s) => s.date <= endOfMonth(prevEnd));
  const pb = (k: string) => {
    if (!prevSnap) return null;
    try {
      return (JSON.parse(prevSnap.breakdown) as Record<string, number>)[k] ?? 0;
    } catch {
      return null;
    }
  };
  const prevCashBalances = accountBalances(ctx.accounts, ctx.txsNative, prevEnd);
  const prevCash = ctx.accounts
    .filter((a) => a.includeInNetWorth && a.currency === ctx.prefs.baseCurrency && !["LOAN", "CREDIT_CARD", "INVESTMENT"].includes(a.type))
    .reduce((s, a) => s + Math.max(0, prevCashBalances.get(a.id) ?? 0), 0);
  const chg = (c: number, p: number | null | undefined) => (p == null || p === 0 ? null : ((c - p) / Math.abs(p)) * 100);

  const last12 = monthlySeries(ctx.txs, { from: addMonths(startOfMonth(ctx.today), -11), to: endOfMonth(ctx.today) });
  const nwSeries = snapshots.map((s) => Number(s.netWorth));
  const compareLabel = range.preset === "this_month" ? "vs last month" : "vs prior period";

  const kpis = [
    { label: "Net worth", value: f(ctx.netWorth.netWorth), delta: chg(ctx.netWorth.netWorth, prevSnap ? Number(prevSnap.netWorth) : null), up: true, tip: "Total assets − total liabilities, as of today. Compared with the recorded month-end snapshot before this period.", spark: nwSeries },
    { label: "Total assets", value: f(ctx.netWorth.totalAssets), delta: chg(ctx.netWorth.totalAssets, prevSnap ? Number(prevSnap.totalAssets) : null), up: true, tip: "Cash & bank balances, brokerage cash, investment holdings and other assets." },
    { label: "Total liabilities", value: f(ctx.netWorth.totalLiabilities), delta: chg(ctx.netWorth.totalLiabilities, prevSnap ? Number(prevSnap.totalLiabilities) : null), up: false, tip: "Loan principal outstanding, credit card dues and other debts." },
    { label: "Cash & bank", value: f(ctx.netWorth.byGroup.CASH_BANK), delta: chg(ctx.netWorth.byGroup.CASH_BANK, prevCash), up: true, tip: "Positive balances in savings, current, cash and wallet accounts. Compared with balances at the end of the previous period (from the ledger)." },
    { label: "Income", value: f(cur.income), delta: chg(cur.income, before.income), up: true, tip: "Income + dividends + interest in the selected period. Transfers, refunds and investment sales are excluded.", spark: last12.map((m) => m.income) },
    { label: "Expenses", value: f(cur.expenses), delta: chg(cur.expenses, before.expenses), up: false, tip: "Expenses − refunds + loan interest. Transfers, investment purchases and loan principal are excluded.", spark: last12.map((m) => m.expenses) },
    { label: "Savings", value: f(cur.savings), delta: chg(cur.savings, before.savings), up: true, tip: "Income − expenses for the selected period.", spark: last12.map((m) => m.savings) },
    { label: "Savings rate", value: formatPct(cur.savingsRate), delta: cur.savingsRate != null && before.savingsRate != null ? cur.savingsRate - before.savingsRate : null, up: true, tip: "Savings ÷ income × 100. Change shown in percentage points.", suffix: " pp" },
    { label: "Investments", value: f(ctx.portfolio.marketValue), delta: chg(ctx.portfolio.marketValue, pb("INVESTMENTS")), up: true, tip: "Current value of holdings using the latest entered prices (labelled with their date)." },
    { label: "Net cash flow", value: formatMoney(netCF, ctx.fmt, { sign: true }), delta: chg(netCF, netCFPrev), up: true, tip: "Change in cash accounts from income, spending, investing and borrowing. Internal transfers excluded." },
  ];

  // Chart data
  const months = monthsInRange(range);
  const byDay = months.length < 2;
  const ieData = byDay
    ? groupDaily(ctx, range)
    : monthlySeries(ctx.txs, range).map((m) => ({ x: m.month, income: m.income, expenses: m.expenses }));
  // Short ranges get a 6-month context window so the trend is readable.
  const cfMonths = months.length >= 3 ? months.slice(-12) : monthsInRange({ from: addMonths(startOfMonth(range.to), -5), to: range.to });
  const cfData = cfMonths.map((m) => {
    const r = { from: `${m}-01`, to: endOfMonth(`${m}-01`) };
    const s = cashFlowStatement(baseAccounts, ctx.txs, r);
    return { x: m, net: s.netChange - s.newAccountOpenings };
  });
  const savingsData = (months.length >= 3 ? monthlySeries(ctx.txs, range) : last12).map((m) => ({ x: m.month, savings: m.savings }));
  const topCats = groupBy(ctx.txs, range, "topCategory", "expense", ctx.catIdx).slice(0, 7);
  const allocRows = [
    ...ctx.portfolio.allocation.map((a) => ({ key: a.assetClass, label: ASSET_CLASS_LABELS[a.assetClass], value: a.value })),
    ...(["CASH_BANK", "INVESTMENT_CASH", "OTHER_ASSETS"] as const).map((g) => ({ key: g, label: NW_GROUP_LABELS[g], value: ctx.netWorth.byGroup[g] })),
  ].filter((r) => r.value > 0);

  // Cumulative invested capital by month (actual contributions) for investment performance
  const invMonths = monthsInRange({ from: addMonths(startOfMonth(ctx.today), -11), to: ctx.today });
  const invSeries = invMonths.map((m) => {
    const end = endOfMonth(`${m}-01`);
    let invested = 0;
    for (const p of ctx.portfolio.positions) {
      for (const cfp of p.cashFlows) if (cfp.date <= end && cfp.amount < 0) invested += -cfp.amount;
    }
    return { x: m, invested };
  });

  const budgets = (await loadBudgets(ctx.userId)).filter((b) => b.active);
  const budget = budgets[0];
  const bStatus = budget ? budgetStatus(budget, ctx.txs, ctx.categories, ctx.today) : null;

  const upcoming = ctx.rules
    .filter((r) => r.active && r.txType !== "INCOME")
    .flatMap((r) => {
      const rec = new Map(r.occurrences.map((o) => [o.dueDate, o.status]));
      return occurrencesBetween(r, addDays(ctx.today, -14), addDays(ctx.today, 21))
        .map((d) => ({ rule: r, due: d, state: occurrenceState(d, ctx.today, rec.get(d), r.reminderDays) }))
        .filter((o) => o.state !== "PAID" && o.state !== "SKIPPED" && !(o.state === "OVERDUE" && r.autoPost));
    })
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6);

  const insights = (await buildInsights(ctx)).slice(0, 4);
  const layout = ctx.prefs.dashboardLayout.length ? ctx.prefs.dashboardLayout : WIDGETS.map((w) => w.id);
  const recent = ctx.txs.slice(0, 7);

  const widgets: Record<string, React.ReactNode> = {
    kpis: (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="flex flex-col px-4 py-3.5">
            <div className="flex items-center justify-between gap-1 text-[12px] font-medium text-fg-2">
              <span className="truncate">{k.label}</span>
              <span className="group relative">
                <span className="cursor-help text-muted" tabIndex={0} aria-label={k.tip}>
                  ⓘ
                </span>
                <span role="tooltip" className="pointer-events-none absolute right-0 top-5 z-40 w-56 rounded-lg border border-line bg-surface p-2.5 text-[11.5px] font-normal text-fg-2 opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {k.tip}
                </span>
              </span>
            </div>
            <div className="mt-1.5 truncate text-[19px] font-semibold tracking-tight text-fg" title={k.value}>
              {k.value}
            </div>
            <div className="mt-1">
              <Delta value={k.delta} goodWhenUp={k.up} suffix={k.suffix ?? "%"} label={k.delta == null ? "" : compareLabel} />
            </div>
            {k.spark && k.spark.length > 1 && (
              <div className="mt-2">
                <Sparkline values={k.spark} positive={k.up} />
              </div>
            )}
          </Card>
        ))}
      </div>
    ),
    networth: (
      <ChartFrame
        title="Net worth over time"
        subtitle={snapshots.some((s) => s.source === "BACKFILLED") ? "Month-end snapshots · earlier months estimated from ledger history (holdings at cost)" : "Month-end snapshots"}
        table={{ columns: ["Month", "Assets", "Liabilities", "Net worth", "Source"], rows: snapshots.map((s) => [monthLabel(s.date.slice(0, 7)), f(Number(s.totalAssets)), f(Number(s.totalLiabilities)), f(Number(s.netWorth)), s.source === "BACKFILLED" ? "Estimated" : "Recorded"]) }}
        action={
          <Link href="/wealth/history" className="text-[12px] text-accent hover:underline">
            History
          </Link>
        }
      >
        {snapshots.length > 1 ? (
          <TrendChart
            prefs={ctx.fmt}
            xKey="x"
            data={snapshots.map((s) => ({ x: s.date.slice(0, 7), netWorth: Number(s.netWorth) }))}
            series={[{ key: "netWorth", name: "Net worth", slot: 0 }]}
            xFormat="month"
            height={250}
          />
        ) : (
          <EmptyState
            title="One snapshot so far"
            description="A snapshot is recorded each month. You can also estimate earlier months from your transaction history."
            action={<LinkButton href="/wealth/history">Build history</LinkButton>}
          />
        )}
      </ChartFrame>
    ),
    insights: (
      <Card className="h-full">
        <CardHeader
          title={
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-ai" /> Financial insights
            </span>
          }
          subtitle="Computed from your records"
          action={
            <Link href="/insights" className="text-[12px] text-accent hover:underline">
              All
            </Link>
          }
        />
        <ul className="space-y-2 px-5 pb-4">
          {insights.length === 0 && <li className="py-6 text-center text-[13px] text-muted">Add a few weeks of transactions to unlock insights.</li>}
          {insights.map((i) => (
            <li key={i.id}>
              <Link href={i.link ?? "/insights"} className="block rounded-lg border border-line p-3 hover:bg-surface-2">
                <p className="flex items-center gap-2 text-[12.5px] font-medium text-fg">
                  <span className={cx("size-1.5 shrink-0 rounded-full", i.tone === "pos" ? "bg-pos" : i.tone === "neg" ? "bg-neg" : i.tone === "warn" ? "bg-[#eda100]" : i.tone === "ai" ? "bg-ai" : "bg-info")} />
                  {i.title}
                </p>
                <p className="mt-0.5 text-[12px] text-fg-2">{i.body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    ),
    "income-expense": (
      <ChartFrame
        title="Income vs expenses"
        subtitle={byDay ? "Daily, selected period" : "Monthly, selected period"}
        legend={[
          { label: "Income", slot: 0 },
          { label: "Expenses", slot: 1 },
        ]}
        table={{ columns: [byDay ? "Day" : "Month", "Income", "Expenses", "Net"], rows: ieData.map((r) => [byDay ? fmtD(String(r.x), ctx.prefs.dateFormat) : monthLabel(String(r.x)), f(r.income), f(r.expenses), f(r.income - r.expenses)]) }}
      >
        <ColumnChart
          prefs={ctx.fmt}
          xKey="x"
          data={ieData}
          series={[
            { key: "income", name: "Income", slot: 0 },
            { key: "expenses", name: "Expenses", slot: 1 },
          ]}
          xFormat={byDay ? "day" : "month"}
        />
      </ChartFrame>
    ),
    cashflow: (
      <ChartFrame
        title="Monthly cash flow"
        subtitle={`Net change in cash accounts, excluding internal transfers${months.length < 3 ? " · last 6 months for context" : ""}`}
        table={{ columns: ["Month", "Net cash flow"], rows: cfData.map((r) => [monthLabel(r.x), f(r.net)]) }}
        action={
          <Link href="/cash-flow" className="text-[12px] text-accent hover:underline">
            Statement
          </Link>
        }
      >
        <ColumnChart prefs={ctx.fmt} xKey="x" data={cfData} series={[{ key: "net", name: "Net cash flow", slot: 0 }]} xFormat="month" />
      </ChartFrame>
    ),
    categories: (
      <Card className="h-full">
        <CardHeader
          title="Largest expense categories"
          subtitle={`${f(cur.expenses)} total in period`}
          action={
            <Link href={`/expenses?range=${range.preset}${range.preset === "custom" ? `&from=${range.from}&to=${range.to}` : ""}`} className="text-[12px] text-accent hover:underline">
              Details
            </Link>
          }
        />
        <div className="px-5 pb-5">
          {topCats.length ? (
            <RankedBars prefs={ctx.fmt} rows={topCats.map((c) => ({ key: c.key, label: categoryLabel(ctx, c.key), value: c.amount, color: categoryColor(ctx, c.key) }))} />
          ) : (
            <p className="py-6 text-center text-[13px] text-muted">No expenses in this period.</p>
          )}
        </div>
      </Card>
    ),
    allocation: (
      <ChartFrame title="Asset allocation" subtitle={`${f(ctx.netWorth.totalAssets, true)} total assets`} table={{ columns: ["Asset", "Value", "Share"], rows: allocRows.map((r) => [r.label, f(r.value), formatPct((r.value / ctx.netWorth.totalAssets) * 100)]) }}>
        {allocRows.length ? <Donut prefs={ctx.fmt} rows={allocRows} height={150} centerLabel="Assets" centerValue={f(ctx.netWorth.totalAssets, true)} /> : <p className="py-8 text-center text-[13px] text-muted">No assets yet.</p>}
      </ChartFrame>
    ),
    investments: (
      <Card className="h-full">
        <CardHeader
          title="Investment portfolio"
          subtitle={ctx.portfolio.positions.length ? `${ctx.portfolio.positions.filter((p) => p.marketValue > 0).length} holdings` : "No holdings yet"}
          action={
            <Link href="/investments" className="text-[12px] text-accent hover:underline">
              Portfolio
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-3 text-[12.5px]">
          <Metric label="Current value" value={f(ctx.portfolio.marketValue)} />
          <Metric label="Invested (cost)" value={f(ctx.portfolio.invested)} />
          <Metric label="Unrealized P/L" value={formatMoney(ctx.portfolio.unrealized, ctx.fmt, { sign: true })} tone={ctx.portfolio.unrealized >= 0 ? "pos" : "neg"} />
          <Metric label="XIRR" value={formatPct(ctx.portfolio.xirr)} tone={(ctx.portfolio.xirr ?? 0) >= 0 ? "pos" : "neg"} />
        </div>
        <div className="px-3 pb-3">
          <TrendChart prefs={ctx.fmt} xKey="x" data={invSeries} series={[{ key: "invested", name: "Cumulative invested", slot: 2 }]} xFormat="month" height={110} />
        </div>
        {ctx.portfolio.unpricedCount > 0 && <p className="px-5 pb-4 text-[11.5px] text-muted">{ctx.portfolio.unpricedCount} holding(s) valued at cost — no price entered.</p>}
      </Card>
    ),
    savings: (
      <ChartFrame title="Savings trend" subtitle="Income − expenses per month" table={{ columns: ["Month", "Savings"], rows: savingsData.map((r) => [monthLabel(r.x), f(r.savings)]) }}>
        <TrendChart prefs={ctx.fmt} xKey="x" data={savingsData} series={[{ key: "savings", name: "Savings", slot: 2 }]} xFormat="month" zeroLine />
      </ChartFrame>
    ),
    budget: (
      <Card className="h-full">
        <CardHeader
          title="Budget utilization"
          subtitle={bStatus ? `${budget!.name} · ${fmtD(bStatus.window.from, ctx.prefs.dateFormat)} – ${fmtD(bStatus.window.to, ctx.prefs.dateFormat)} · ${bStatus.daysLeft} days left` : "No active budget"}
          action={
            <Link href={budget ? `/budgets/${budget.id}` : "/budgets/new"} className="text-[12px] text-accent hover:underline">
              {budget ? "Open" : "Create"}
            </Link>
          }
        />
        {bStatus ? (
          <ul className="space-y-3 px-5 pb-5">
            {bStatus.lines
              .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0))
              .slice(0, 6)
              .map((l) => (
                <li key={l.lineId}>
                  <div className="mb-1 flex justify-between text-[12.5px]">
                    <span className="text-fg">{categoryLabel(ctx, l.categoryId)}</span>
                    <span className="num text-fg-2">
                      {f(l.actual)} <span className="text-muted">/ {f(l.available)}</span>
                    </span>
                  </div>
                  <ProgressBar value={l.utilization} label={`${categoryLabel(ctx, l.categoryId)} budget used`} />
                </li>
              ))}
          </ul>
        ) : (
          <EmptyState title="No budget yet" description="Plan monthly spending by category and get alerts at 50/75/90/100%." action={<LinkButton href="/budgets/new" size="sm">Create budget</LinkButton>} />
        )}
      </Card>
    ),
    recent: (
      <Card className="h-full">
        <CardHeader
          title="Recent transactions"
          action={
            <Link href="/transactions" className="text-[12px] text-accent hover:underline">
              View all
            </Link>
          }
        />
        <TxList ctx={ctx} txs={recent} />
      </Card>
    ),
    bills: (
      <Card className="h-full">
        <CardHeader
          title="Upcoming bills"
          subtitle="Next 3 weeks & overdue"
          action={
            <Link href="/payments" className="text-[12px] text-accent hover:underline">
              Payments
            </Link>
          }
        />
        {upcoming.length ? (
          <ul className="divide-y divide-line">
            {upcoming.map((o) => (
              <li key={o.rule.id + o.due} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{o.rule.name}</span>
                  <span className="text-[11.5px] text-muted">
                    {fmtD(o.due, ctx.prefs.dateFormat)} {o.rule.autoPost && "· auto-posts"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {o.state === "OVERDUE" ? <Badge tone="neg">Overdue</Badge> : o.state === "DUE_SOON" ? <Badge tone="warn">Due soon</Badge> : null}
                  <span className="num text-[13px] font-medium">{f(o.rule.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-[13px] text-muted">Nothing due in the next three weeks.</p>
        )}
      </Card>
    ),
    goals: (
      <Card className="h-full">
        <CardHeader
          title="Goals progress"
          action={
            <Link href="/goals" className="text-[12px] text-accent hover:underline">
              Goals
            </Link>
          }
        />
        {ctx.goals.filter((g) => g.status === "ACTIVE").length ? (
          <ul className="space-y-3.5 px-5 pb-5">
            {ctx.goals
              .filter((g) => g.status === "ACTIVE")
              .slice(0, 5)
              .map((g) => (
                <li key={g.id}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
                    <span className="truncate font-medium">{g.name}</span>
                    <span className="num shrink-0 text-fg-2">
                      {f(g.current, true)} / {f(g.targetAmount, true)}
                    </span>
                  </div>
                  <ProgressBar value={g.progress.pct} tone={g.progress.onTrack === false ? "accent" : "pos"} label={`${g.name} progress`} />
                  <p className="mt-1 text-[11.5px] text-muted">
                    {formatPct(g.progress.pct, 0)} ·{" "}
                    {g.progress.projectedDate ? `projected ${fmtD(g.progress.projectedDate, ctx.prefs.dateFormat)}` : "add a monthly contribution to project completion"}
                    {g.progress.onTrack === false && <span className="text-neg"> · behind target</span>}
                  </p>
                </li>
              ))}
          </ul>
        ) : (
          <EmptyState icon={<Target className="size-5" />} title="No goals yet" action={<LinkButton href="/goals" size="sm">Add a goal</LinkButton>} />
        )}
      </Card>
    ),
    accounts: (
      <Card className="h-full">
        <CardHeader
          title="Account balances"
          action={
            <Link href="/accounts" className="text-[12px] text-accent hover:underline">
              Accounts
            </Link>
          }
        />
        <ul className="divide-y divide-line">
          {ctx.accounts
            .filter((a) => a.status === "ACTIVE")
            .slice(0, 8)
            .map((a) => {
              const bal = ctx.balances.get(a.id) ?? 0;
              return (
                <li key={a.id}>
                  <Link href={`/accounts/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-surface-2/60">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{a.name}</span>
                      <span className="text-[11.5px] text-muted">{ACCOUNT_TYPE_LABELS[a.type]}</span>
                    </span>
                    <span className={cx("num text-[13px] font-medium", bal < 0 && "text-neg")}>{formatMoney(bal, { ...ctx.fmt, currency: a.currency })}</span>
                  </Link>
                </li>
              );
            })}
        </ul>
      </Card>
    ),
  };

  return (
    <>
      <PageHeader
        eyebrow={fmtD(ctx.today, "DD MMM YYYY")}
        title="Dashboard"
        description={metrics.monthsOfData < 2 ? "Comparisons improve as more months of history are recorded." : undefined}
        actions={
          <>
            <Suspense>
              <RangePicker value={range.preset} from={range.from} to={range.to} />
            </Suspense>
            <CustomizeDashboard widgets={WIDGETS.map(({ id, label }) => ({ id, label }))} layout={ctx.prefs.dashboardLayout} />
          </>
        }
      />
      <div className="no-print mb-5 flex flex-wrap gap-2">
        <QuickAddButton />
        <LinkButton href="/accounts/transfers" size="sm">
          <Wallet className="size-3.5" /> Transfer
        </LinkButton>
        <LinkButton href="/import" size="sm">
          <Upload className="size-3.5" /> Import CSV
        </LinkButton>
        <LinkButton href="/investments/holdings" size="sm">
          Update prices
        </LinkButton>
        <LinkButton href="/analyst" size="sm" className="text-ai">
          <Sparkles className="size-3.5" /> Ask the analyst <ArrowRight className="size-3.5" />
        </LinkButton>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {layout
          .filter((id) => widgets[id])
          .map((id) => (
            <div key={id} className={cx("min-w-0", WIDGETS.find((w) => w.id === id)?.span)}>
              {widgets[id]}
            </div>
          ))}
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-muted">{label}</p>
      <p className={cx("num mt-0.5 text-[14px] font-semibold", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{value}</p>
    </div>
  );
}

function groupDaily(ctx: Awaited<ReturnType<typeof pageCtx>>, range: { from: string; to: string }) {
  const days: { x: string; income: number; expenses: number }[] = [];
  const inc = new Map(groupBy(ctx.txs, range, "day", "income").map((r) => [r.key, r.amount]));
  const exp = new Map(groupBy(ctx.txs, range, "day", "expense").map((r) => [r.key, r.amount]));
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push({ x: d, income: inc.get(d) ?? 0, expenses: exp.get(d) ?? 0 });
  return days;
}
