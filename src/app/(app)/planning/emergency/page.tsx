import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { keyMetrics, lastCompleteMonths } from "@/lib/server/data";
import { essentialSplit } from "@/lib/finance/ledger";
import { formatMoney } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, Notice, PageHeader, ProgressBar, Stat } from "@/components/ui/core";

export const metadata = { title: "Emergency fund" };

export default async function EmergencyPage() {
  const ctx = await pageCtx();
  const m = keyMetrics(ctx);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const r6 = lastCompleteMonths(ctx.today, 6);
  const split = essentialSplit(ctx.txs, r6, ctx.catIdx);
  const months = Math.max(1, m.monthsOfData);
  const essentialMonthly = Math.round(split.essential / months);
  const emiMonthly = m.monthlyDebtPayments;
  const target = ctx.prefs.emergencyFundMonths;
  const needBasic = (essentialMonthly + emiMonthly) * target;
  const needFull = m.avgMonthlyExpenses * target;
  const liquid = ctx.netWorth.liquidAssets;
  const coverEssential = essentialMonthly + emiMonthly > 0 ? liquid / (essentialMonthly + emiMonthly) : null;
  const goal = ctx.goals.find((g) => g.type === "EMERGENCY_FUND" && g.status === "ACTIVE");
  const fds = ctx.portfolio.positions.filter((p) => p.holding.assetClass === "FIXED_DEPOSIT").reduce((s, p) => s + p.marketValue, 0);

  return (
    <>
      <PageHeader
        title="Emergency fund"
        description={`Cover for ${target} months of expenses (change the target in Settings). Calculated from your actual spending over the last ${months} complete month(s).`}
        actions={goal ? <LinkButton href="/goals">View goal</LinkButton> : <LinkButton href="/goals" variant="primary">Create emergency-fund goal</LinkButton>}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Liquid cash today" value={f(liquid)} tooltip="Positive balances in savings, current, cash and wallet accounts." />
        <Stat label="Essential + EMIs / month" value={f(essentialMonthly + emiMonthly)} hint={`essentials ${f(essentialMonthly)} · EMIs ${f(emiMonthly)}`} />
        <Stat label="All expenses / month" value={f(m.avgMonthlyExpenses)} hint={m.basis} />
        <Stat label="Coverage (essentials)" value={coverEssential != null ? `${coverEssential.toFixed(1)} months` : "—"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: "Lean target", text: `${target} × essentials + EMIs`, need: needBasic },
          { title: "Comfortable target", text: `${target} × all average expenses`, need: needFull },
        ].map((t) => (
          <Card key={t.title} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-semibold">{t.title}</p>
                <p className="text-[12px] text-muted">{t.text}</p>
              </div>
              {liquid >= t.need ? <Badge tone="pos">Fully funded</Badge> : <Badge tone="warn">{f(t.need - liquid)} short</Badge>}
            </div>
            <p className="num mt-3 text-[20px] font-semibold">{f(t.need)}</p>
            <ProgressBar value={t.need ? (liquid / t.need) * 100 : null} tone="pos" className="mt-2" label={`${t.title} funded`} />
            {liquid < t.need && m.avgMonthlySavings > 0 && (
              <p className="mt-2 text-[12px] text-fg-2">
                At your average savings of {f(m.avgMonthlySavings)}/month, about {Math.ceil((t.need - liquid) / m.avgMonthlySavings)} month(s) to close the gap (estimate).
              </p>
            )}
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader title="Where to keep it" />
        <ul className="list-disc space-y-1 pb-5 pl-10 pr-5 text-[13px] text-fg-2">
          <li>Savings accounts and sweep-in FDs keep money instantly available. Your FDs total {f(fds)}; premature withdrawal may carry a penalty.</li>
          <li>Keep the fund separate from day-to-day spending. Link a dedicated savings account to an emergency-fund goal to track it automatically.</li>
          <li>Equity investments aren&apos;t counted as emergency cash because their value can fall when you need it.</li>
        </ul>
      </Card>
      <Notice className="mt-4">
        Essential spending uses categories marked “essential” in <Link href="/categories" className="underline">Categories</Link>. This is guidance derived from your data, not financial advice.
      </Notice>
    </>
  );
}
