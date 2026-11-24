import { notFound } from "next/navigation";
import { pageCtx } from "@/lib/server/page";
import { loadBudgets } from "@/lib/server/budgets";
import { builderData } from "@/lib/server/budget-builder-data";
import { PageHeader } from "@/components/ui/core";
import { BudgetBuilder } from "../../builder";

export default async function EditBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const b = (await loadBudgets(ctx.userId)).find((x) => x.id === id);
  if (!b) notFound();
  const d = builderData(ctx);
  return (
    <>
      <PageHeader title={`Edit “${b.name}”`} />
      <BudgetBuilder
        categories={d.categories}
        avgIncome={d.avgIncome}
        today={ctx.today}
        currency={ctx.prefs.baseCurrency}
        locale={ctx.prefs.locale}
        initial={{
          id: b.id,
          name: b.name,
          period: b.period,
          method: b.method,
          startDate: b.startDate,
          endDate: b.endDate,
          rollover: b.rollover,
          expectedIncome: b.expectedIncome,
          lines: b.lines.map((l) => ({ categoryId: l.categoryId, amount: l.amount, group: l.group as "NEEDS" | "WANTS" | "SAVINGS" | null, isLimit: l.isLimit })),
        }}
      />
    </>
  );
}
