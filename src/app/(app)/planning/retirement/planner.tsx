"use client";

import { useMemo, useState } from "react";
import { retirementPlan } from "@/lib/finance/forecast";
import { parseMoney } from "@/lib/finance/money";
import { formatMoney, minorToInput, type FormatPrefs } from "@/lib/format";
import { Card, CardHeader, Notice } from "@/components/ui/core";
import { ChartFrame, TrendChart } from "@/components/charts";

export function RetirementPlanner({ prefs, defaults }: { prefs: FormatPrefs; defaults: { monthlyExpenses: number; corpus: number; sip: number } }) {
  const [v, setV] = useState({
    currentAge: "32",
    retireAge: "60",
    lifeExpectancy: "85",
    monthlyExpenses: minorToInput(defaults.monthlyExpenses),
    inflation: "6",
    preReturn: "10",
    postReturn: "7",
    corpus: minorToInput(defaults.corpus),
    sip: minorToInput(defaults.sip),
    stepUp: "5",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const num = (s: string) => (Number.isFinite(Number(s)) ? Number(s) : 0);
  const plan = useMemo(() => {
    const ages = [num(v.currentAge), num(v.retireAge), num(v.lifeExpectancy)];
    if (!(ages[0] > 0 && ages[1] > ages[0] && ages[2] > ages[1] && ages[2] <= 110)) return null;
    return retirementPlan({
      currentAge: ages[0],
      retireAge: ages[1],
      lifeExpectancy: ages[2],
      monthlyExpensesToday: parseMoney(v.monthlyExpenses || "0") ?? 0,
      inflationPct: num(v.inflation),
      preReturnPct: num(v.preReturn),
      postReturnPct: num(v.postReturn),
      currentCorpus: parseMoney(v.corpus || "0") ?? 0,
      monthlySip: parseMoney(v.sip || "0") ?? 0,
      sipStepUpPct: num(v.stepUp),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v]);
  const f = (x: number) => formatMoney(x, prefs);
  const fc = (x: number) => formatMoney(x, prefs, { compact: true });
  const inp = "num h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px]";
  const fields: [keyof typeof v, string][] = [
    ["currentAge", "Current age"],
    ["retireAge", "Retirement age"],
    ["lifeExpectancy", "Plan until age"],
    ["monthlyExpenses", "Monthly expenses today"],
    ["inflation", "Inflation % p.a."],
    ["preReturn", "Return before retirement %"],
    ["postReturn", "Return after retirement %"],
    ["corpus", "Current retirement savings"],
    ["sip", "Monthly investment"],
    ["stepUp", "Annual step-up %"],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="h-fit p-5 lg:col-span-4">
        <p className="mb-1 text-[13.5px] font-semibold">Your assumptions</p>
        <p className="mb-4 text-[12px] text-muted">Defaults come from your data: expenses = recent monthly average, savings = current investments.</p>
        <div className="grid grid-cols-2 gap-3">
          {fields.map(([k, label]) => (
            <label key={k} className="text-[12px] font-medium text-fg-2">
              {label}
              <input className={`${inp} mt-1`} inputMode="decimal" value={v[k]} onChange={set(k)} />
            </label>
          ))}
        </div>
      </Card>
      <div className="space-y-4 lg:col-span-8">
        {!plan ? (
          <Notice tone="warn">Check the ages: current &lt; retirement &lt; plan-until.</Notice>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Expenses at retirement", `${f(plan.expensesAtRetirement)}/mo`],
                ["Corpus needed", fc(plan.corpusNeeded)],
                ["Projected corpus", fc(plan.projectedCorpus)],
                [plan.gap > 0 ? "Shortfall" : "Surplus", fc(Math.abs(plan.gap))],
              ].map(([l, val]) => (
                <Card key={l} className="p-4">
                  <p className="text-[12px] text-fg-2">{l}</p>
                  <p className={`num mt-1 text-[17px] font-semibold ${l === "Shortfall" ? "text-neg" : l === "Surplus" ? "text-pos" : ""}`}>{val}</p>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader title={plan.gap > 0 ? "To close the gap" : "You're on track"} />
              <p className="px-5 pb-5 text-[13px] text-fg-2">
                {plan.requiredSip != null && (
                  <>
                    A monthly investment of <b className="num text-fg">{f(plan.requiredSip)}</b> (growing {v.stepUp}% a year) would reach the required corpus by age {v.retireAge}.{" "}
                  </>
                )}
                {plan.depletedAge ? <>At the current plan, savings would run out around age <b className="text-neg">{plan.depletedAge}</b>.</> : <>At the current plan, savings last through age {v.lifeExpectancy}.</>}
              </p>
            </Card>
            <ChartFrame
              title="Projected retirement corpus"
              subtitle="Estimate — accumulation then inflation-adjusted withdrawals"
              table={{ columns: ["Age", "Corpus", "Phase"], rows: plan.series.map((s) => [s.age, f(s.corpus), s.phase]) }}
            >
              <TrendChart prefs={prefs} xKey="x" data={plan.series.map((s) => ({ x: String(s.age), corpus: s.corpus }))} series={[{ key: "corpus", name: "Corpus", slot: 6 }]} xFormat="age" height={260} />
            </ChartFrame>
            <Notice>
              Projections are estimates from your assumptions, not guarantees. Returns, inflation and expenses vary; EPF/NPS rules, taxes and healthcare costs aren&apos;t modelled. Revisit yearly.
            </Notice>
          </>
        )}
      </div>
    </div>
  );
}
