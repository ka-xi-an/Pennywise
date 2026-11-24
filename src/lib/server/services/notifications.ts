import "server-only";
import { db } from "../db";
import type { Ctx } from "../data";
import { keyMetrics } from "../data";
import { budgetStatus, type BudgetRec } from "@/lib/finance/budget";
import { occurrencesBetween, occurrenceState } from "@/lib/finance/recurring";
import { addDays } from "@/lib/finance/dates";
import { detectAnomalies } from "@/lib/finance/insights";
import { upcomingMaturities } from "@/lib/finance/investments";
import { formatDate, formatMoney } from "@/lib/format";
import { loadBudgets } from "../budgets";

interface N {
  type: string;
  severity: "info" | "warning" | "critical" | "success";
  title: string;
  body: string;
  link?: string;
  dedupeKey: string;
}

/** Derives notifications from current data; each event is stored once (dedupeKey). */
export async function syncNotifications(ctx: Ctx) {
  const out: N[] = [];
  const np = ctx.prefs.notificationPrefs;
  const f = (m: number) => formatMoney(m, ctx.fmt);
  const name = (id: string | null) => (id ? ctx.catIdx.get(id)?.name : null) ?? "Uncategorized";

  if (np.budget) {
    const budgets = await loadBudgets(ctx.userId);
    for (const b of budgets.filter((x) => x.active)) {
      const s = budgetStatus(b as BudgetRec, ctx.txs, ctx.categories, ctx.today);
      for (const l of s.lines) {
        if (l.level === "ok") continue;
        const sev = l.level === "100" ? "critical" : l.level === "90" ? "warning" : "info";
        out.push({
          type: "budget",
          severity: sev,
          title: l.level === "100" ? `Over budget: ${name(l.categoryId)}` : `${l.level}% of ${name(l.categoryId)} budget used`,
          body: `${f(l.actual)} of ${f(l.available)} spent in “${b.name}” (${formatDate(s.window.from, ctx.fmt)} → ${formatDate(s.window.to, ctx.fmt)}).${l.isLimit && l.level === "100" ? " This is a hard spending limit." : ""}`,
          link: `/budgets/${b.id}`,
          dedupeKey: `budget:${b.id}:${l.lineId}:${s.window.from}:${l.level}`,
        });
      }
    }
  }

  if (np.bills) {
    for (const r of ctx.rules.filter((x) => x.active && x.txType !== "INCOME")) {
      const recorded = new Map(r.occurrences.map((o) => [o.dueDate, o.status]));
      for (const d of occurrencesBetween(r, addDays(ctx.today, -30), addDays(ctx.today, r.reminderDays))) {
        const st = occurrenceState(d, ctx.today, recorded.get(d), r.reminderDays);
        if (st === "DUE_SOON")
          out.push({
            type: "bill",
            severity: "info",
            title: `${r.name} due ${d === ctx.today ? "today" : `on ${formatDate(d, ctx.fmt)}`}`,
            body: `${f(r.amount)} from ${ctx.accountById.get(r.accountId)?.name ?? "account"}.`,
            link: "/payments",
            dedupeKey: `bill:${r.id}:${d}:soon`,
          });
        if (st === "OVERDUE" && !r.autoPost)
          out.push({
            type: "bill",
            severity: "critical",
            title: `Missed payment: ${r.name}`,
            body: `${f(r.amount)} was due on ${formatDate(d, ctx.fmt)} and is not marked paid.`,
            link: "/payments",
            dedupeKey: `bill:${r.id}:${d}:missed`,
          });
      }
    }
  }

  const recent = { from: addDays(ctx.today, -7), to: ctx.today };
  if (np.largeExpense) {
    for (const t of ctx.txs) {
      if (t.type !== "EXPENSE" || t.date < recent.from || t.date > recent.to || t.amount < ctx.prefs.largeExpenseThreshold) continue;
      out.push({
        type: "large_expense",
        severity: "info",
        title: `Large expense: ${f(t.amount)}`,
        body: `${t.merchant ?? t.description ?? name(t.categoryId)} on ${formatDate(t.date, ctx.fmt)}.`,
        link: `/transactions?q=${encodeURIComponent(t.merchant ?? "")}`,
        dedupeKey: `large:${t.id}`,
      });
    }
  }
  if (np.unusual) {
    for (const a of detectAnomalies(ctx.txs, ctx.today, ctx.prefs.largeExpenseThreshold, 14).slice(0, 5)) {
      out.push({
        type: "unusual",
        severity: "warning",
        title: `Unusual spending in ${name(a.tx.categoryId)}`,
        body: `${f(a.tx.amount)} at ${a.tx.merchant ?? "unknown merchant"} on ${formatDate(a.tx.date, ctx.fmt)} — ${a.reason}.`,
        link: "/analyst/intelligence",
        dedupeKey: `unusual:${a.tx.id}`,
      });
    }
  }
  if (np.maturity) {
    for (const m of upcomingMaturities(ctx.holdings, ctx.today, 30)) {
      out.push({
        type: "maturity",
        severity: "info",
        title: `${m.holding.name} matures in ${m.daysLeft} day${m.daysLeft === 1 ? "" : "s"}`,
        body: `Maturity date ${formatDate(m.holding.maturityDate, ctx.fmt)}. Plan reinvestment or withdrawal.`,
        link: `/investments/${m.holding.id}`,
        dedupeKey: `maturity:${m.holding.id}:${m.holding.maturityDate}`,
      });
    }
  }
  if (np.goals) {
    for (const g of ctx.goals.filter((x) => x.status === "ACTIVE" && x.progress.milestone > 0)) {
      out.push({
        type: "goal",
        severity: "success",
        title: g.progress.milestone === 100 ? `Goal reached: ${g.name} 🎉` : `${g.name}: ${g.progress.milestone}% milestone`,
        body: `${f(g.current)} of ${f(g.targetAmount)}.`,
        link: "/goals",
        dedupeKey: `goal:${g.id}:${g.progress.milestone}`,
      });
    }
  }
  if (np.cashflow) {
    const m = keyMetrics(ctx);
    const projected = ctx.netWorth.liquidAssets + m.avgNetCashFlow * 3;
    if (m.monthsOfData >= 2 && m.avgNetCashFlow < 0 && projected < m.avgMonthlyExpenses) {
      out.push({
        type: "cashflow",
        severity: "warning",
        title: "Cash balance projected to run low",
        body: `At the recent average net cash flow of ${f(m.avgNetCashFlow)}/month, liquid cash would be about ${f(projected)} in 3 months (estimate).`,
        link: "/cash-flow",
        dedupeKey: `cashflow:${ctx.today.slice(0, 7)}`,
      });
    }
  }

  if (!out.length) return;
  const keys = out.map((o) => o.dedupeKey);
  const existing = new Set(
    (await db.notification.findMany({ where: { userId: ctx.userId, dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((x) => x.dedupeKey),
  );
  const fresh = out.filter((o, i) => !existing.has(o.dedupeKey) && keys.indexOf(o.dedupeKey) === i);
  if (fresh.length) await db.notification.createMany({ data: fresh.map((o) => ({ ...o, userId: ctx.userId })) });
}
