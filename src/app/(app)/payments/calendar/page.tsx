import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageCtx, param, type SP } from "@/lib/server/page";
import { occurrencesView } from "@/lib/server/rules-view";
import { addDays, addMonths, endOfMonth, startOfMonth, startOfWeek, monthLabel, isISODate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/format";
import { Card, PageHeader, btnClass, cx } from "@/components/ui/core";

export const metadata = { title: "Payment calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const m = param(sp, "m");
  const month = m && isISODate(`${m}-01`) ? `${m}-01` : startOfMonth(ctx.today);
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const occ = occurrencesView(ctx, ctx.rules.filter((r) => r.active || r.occurrences.length), gridStart, gridEnd);
  const byDay = new Map<string, typeof occ>();
  for (const o of occ) byDay.set(o.due, [...(byDay.get(o.due) ?? []), o]);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const totalOut = occ.filter((o) => o.due.slice(0, 7) === month.slice(0, 7) && o.rule.txType !== "INCOME").reduce((s, o) => s + o.rule.amount, 0);
  const totalIn = occ.filter((o) => o.due.slice(0, 7) === month.slice(0, 7) && o.rule.txType === "INCOME").reduce((s, o) => s + o.rule.amount, 0);

  return (
    <>
      <PageHeader
        title="Payment calendar"
        description={`Scheduled in ${monthLabel(month.slice(0, 7))}: ${formatMoney(totalOut, ctx.fmt)} out · ${formatMoney(totalIn, ctx.fmt)} in`}
        actions={
          <div className="flex items-center gap-1">
            <Link className={btnClass("secondary", "icon")} href={`/payments/calendar?m=${addMonths(month, -1).slice(0, 7)}`} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Link>
            <Link className={btnClass("secondary")} href="/payments/calendar">
              Today
            </Link>
            <Link className={btnClass("secondary", "icon")} href={`/payments/calendar?m=${addMonths(month, 1).slice(0, 7)}`} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2/60 text-center text-[11.5px] font-medium uppercase tracking-wide text-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const items = byDay.get(d) ?? [];
            const inMonth = d.slice(0, 7) === month.slice(0, 7);
            return (
              <div key={d} className={cx("min-h-[104px] border-b border-r border-line p-1.5 text-[11.5px] [&:nth-child(7n)]:border-r-0", !inMonth && "bg-surface-2/40")}>
                <div className={cx("mb-1 flex size-6 items-center justify-center rounded-full text-[12px]", d === ctx.today ? "bg-fg font-semibold text-bg" : inMonth ? "text-fg-2" : "text-muted")}>
                  {Number(d.slice(8))}
                </div>
                <ul className="space-y-1">
                  {items.map((o) => (
                    <li
                      key={o.rule.id}
                      title={`${o.rule.name} · ${formatMoney(o.rule.amount, ctx.fmt)} · ${o.state.toLowerCase().replace("_", " ")}`}
                      className={cx(
                        "truncate rounded px-1.5 py-0.5",
                        o.state === "PAID" && "bg-pos-soft text-pos line-through decoration-1",
                        o.state === "SKIPPED" && "bg-surface-3 text-muted line-through",
                        o.state === "OVERDUE" && (o.rule.autoPost ? "bg-surface-3 text-fg-2" : "bg-neg-soft text-neg"),
                        o.state === "DUE_SOON" && "bg-warn-soft text-warn",
                        o.state === "UPCOMING" && (o.rule.txType === "INCOME" ? "bg-pos-soft text-pos" : "bg-info-soft text-info"),
                      )}
                    >
                      <span className="font-medium">{o.rule.name}</span> {formatMoney(o.rule.amount, ctx.fmt, { compact: true })}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>
      <p className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-info-soft ring-1 ring-info/30" /> Upcoming bill</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-warn-soft ring-1 ring-warn/30" /> Due soon</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-neg-soft ring-1 ring-neg/30" /> Overdue</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-pos-soft ring-1 ring-pos/30" /> Paid / income</span>
      </p>
    </>
  );
}
