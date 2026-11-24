import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { getCtx } from "@/lib/server/data";
import { Logo } from "@/components/logo";
import { OnboardingWizard } from "./wizard";
import { formatMoney } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/types";

export const metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const ctx = await getCtx(user.id);
  if (ctx.prefs.onboarded) redirect("/dashboard");
  return (
    <div className="min-h-dvh bg-bg">
      <header className="flex h-14 items-center border-b border-line bg-surface px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <OnboardingWizard
          name={user.name}
          today={ctx.today}
          prefs={{
            baseCurrency: ctx.prefs.baseCurrency,
            locale: ctx.prefs.locale,
            timezone: ctx.prefs.timezone,
            fyStartMonth: ctx.prefs.fyStartMonth,
            dateFormat: ctx.prefs.dateFormat,
            largeExpenseThreshold: ctx.prefs.largeExpenseThreshold,
            emergencyFundMonths: ctx.prefs.emergencyFundMonths,
          }}
          accounts={ctx.accounts.map((a) => ({
            id: a.id,
            name: a.name,
            type: ACCOUNT_TYPE_LABELS[a.type],
            rawType: a.type,
            balance: formatMoney(ctx.balances.get(a.id) ?? 0, { ...ctx.fmt, currency: a.currency }),
          }))}
          categories={ctx.categories.filter((c) => !c.parentId).map((c) => ({ id: c.id, name: c.name, kind: c.kind, archived: c.archived, color: c.color }))}
          incomeCategoryId={ctx.categories.find((c) => c.name === "Salary")?.id ?? null}
          counts={{ assets: ctx.assets.length, liabilities: ctx.liabilities.length + ctx.loans.length, goals: ctx.goals.length, rules: ctx.rules.length }}
        />
      </main>
    </div>
  );
}
