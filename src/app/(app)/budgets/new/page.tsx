import { pageCtx } from "@/lib/server/page";
import { builderData } from "@/lib/server/budget-builder-data";
import { PageHeader } from "@/components/ui/core";
import { BudgetBuilder } from "../builder";

export const metadata = { title: "Budget planning" };

export default async function NewBudgetPage() {
  const ctx = await pageCtx();
  const d = builderData(ctx);
  return (
    <>
      <PageHeader title="Budget planning" description="Choose a method, then plan amounts per category. Suggestions come from your actual spending over the last three complete months." />
      <BudgetBuilder categories={d.categories} avgIncome={d.avgIncome} today={ctx.today} currency={ctx.prefs.baseCurrency} locale={ctx.prefs.locale} />
    </>
  );
}
