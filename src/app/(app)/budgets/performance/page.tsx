import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { loadBudgets } from "@/lib/server/budgets";
import { categoryLabel } from "@/lib/server/data";
import { budgetStatus, periodWindow, previousWindow } from "@/lib/finance/budget";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui/core";

export const metadata = { title: "Budget performance" };

export default async function BudgetPerformancePage() {
  const ctx = await pageCtx();
  const budgets = (await loadBudgets(ctx.userId)).filter((b) => b.active);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  return (
    <>
      <PageHeader title="Budget performance" description="How each budget performed over its recent periods — planned vs actual and how often each category stayed within plan." />
      {!budgets.length && (
        <Card>
          <EmptyState title="No active budgets" action={<LinkButton href="/budgets/new">Create a budget</LinkButton>} />
        </Card>
      )}
      <div className="space-y-4">
        {budgets.map((b) => {
          const periods: ReturnType<typeof budgetStatus>[] = [];
          let w: { from: string; to: string } | null = periodWindow(b, ctx.today);
          for (let i = 0; i < 6 && w && w.to >= b.startDate; i++) {
            periods.unshift(budgetStatus({ ...b, rollover: false }, ctx.txs, ctx.categories, ctx.today, w.from));
            w = previousWindow(b, w);
          }
          const complete = periods.filter((p) => p.window.to < ctx.today);
          return (
            <Card key={b.id}>
              <CardHeader title={<Link href={`/budgets/${b.id}`} className="hover:underline">{b.name}</Link>} subtitle={`${complete.length} complete period(s) analysed`} />
              <Table>
                <thead>
                  <tr>
                    <Th>Category</Th>
                    {periods.map((p) => (
                      <Th key={p.window.from} align="right">
                        {formatDate(p.window.from, ctx.fmt)}
                      </Th>
                    ))}
                    <Th align="right">Within plan</Th>
                  </tr>
                </thead>
                <tbody>
                  {b.lines.map((line) => {
                    const within = complete.filter((p) => {
                      const l = p.lines.find((x) => x.lineId === line.id);
                      return l && l.actual <= l.planned;
                    }).length;
                    return (
                      <tr key={line.id}>
                        <Td className="font-medium">{categoryLabel(ctx, line.categoryId)}</Td>
                        {periods.map((p) => {
                          const l = p.lines.find((x) => x.lineId === line.id)!;
                          return (
                            <Td key={p.window.from} align="right" className={l.actual > l.planned ? "text-neg" : ""}>
                              {formatPct(l.utilization, 0)}
                            </Td>
                          );
                        })}
                        <Td align="right">{complete.length ? <Badge tone={within === complete.length ? "pos" : within >= complete.length / 2 ? "warn" : "neg"}>{within}/{complete.length}</Badge> : "—"}</Td>
                      </tr>
                    );
                  })}
                  <tr className="bg-surface-2/50 font-semibold">
                    <Td>Total spent / planned</Td>
                    {periods.map((p) => (
                      <Td key={p.window.from} align="right" className={p.actual > p.planned ? "text-neg" : ""}>
                        {f(p.actual)}
                        <span className="block text-[11px] font-normal text-muted">of {f(p.planned)}</span>
                      </Td>
                    ))}
                    <Td> </Td>
                  </tr>
                </tbody>
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
