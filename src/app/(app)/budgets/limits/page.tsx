import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { loadBudgets } from "@/lib/server/budgets";
import { categoryLabel } from "@/lib/server/data";
import { budgetStatus } from "@/lib/finance/budget";
import { formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, LinkButton, PageHeader, ProgressBar, Table, Td, Th } from "@/components/ui/core";
import { ActionButton } from "@/components/ui/modal";
import { setLimit } from "../actions";

export const metadata = { title: "Spending limits" };

export default async function LimitsPage() {
  const ctx = await pageCtx();
  const budgets = (await loadBudgets(ctx.userId)).filter((b) => b.active);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const rows = budgets.flatMap((b) => {
    const s = budgetStatus(b, ctx.txs, ctx.categories, ctx.today);
    return s.lines.map((l) => ({ b, l, s }));
  });
  return (
    <>
      <PageHeader
        title="Spending limits"
        description="Hard limits are budget lines that escalate to critical alerts when exceeded. Toggle any budgeted category into a limit."
        actions={<LinkButton href="/budgets/new">New budget</LinkButton>}
      />
      {!rows.length ? (
        <Card>
          <EmptyState icon={<ShieldAlert className="size-5" />} title="No budgeted categories yet" description="Create a budget, then mark categories as hard limits here." />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Budgeted categories" subtitle={`${rows.filter((r) => r.l.isLimit).length} hard limit(s)`} />
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Budget</Th>
                <Th align="right">Limit</Th>
                <Th align="right">Spent</Th>
                <Th>Status</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort((a, z) => Number(z.l.isLimit) - Number(a.l.isLimit) || (z.l.utilization ?? 0) - (a.l.utilization ?? 0))
                .map(({ b, l }) => (
                  <tr key={l.lineId}>
                    <Td className="font-medium">
                      {categoryLabel(ctx, l.categoryId)} {l.isLimit && <Badge tone="neg">Hard limit</Badge>}
                    </Td>
                    <Td>
                      <Link href={`/budgets/${b.id}`} className="text-fg-2 hover:underline">
                        {b.name}
                      </Link>
                    </Td>
                    <Td align="right">{f(l.available)}</Td>
                    <Td align="right">{f(l.actual)}</Td>
                    <Td className="min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={l.utilization} className="flex-1" />
                        <span className="num text-[12px] text-fg-2">{formatPct(l.utilization, 0)}</span>
                      </div>
                    </Td>
                    <Td align="right">
                      <ActionButton action={setLimit.bind(null, l.lineId, !l.isLimit)} variant={l.isLimit ? "ghost" : "secondary"}>
                        {l.isLimit ? "Remove limit" : "Make hard limit"}
                      </ActionButton>
                    </Td>
                  </tr>
                ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
