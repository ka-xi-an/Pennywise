"use client";

import { useMemo, useState } from "react";
import { simulate, type SimParams } from "@/lib/finance/forecast";
import { monthsToTarget } from "@/lib/finance/goals";
import { parseMoney } from "@/lib/finance/money";
import { addMonths, formatDate } from "@/lib/finance/dates";
import { formatMoney, type FormatPrefs } from "@/lib/format";
import { Card, CardHeader, Notice, cx } from "@/components/ui/core";
import { ChartFrame, TrendChart } from "@/components/charts";

interface Goal {
  name: string;
  remaining: number;
  monthly: number;
}

export function Simulator({ base, prefs, today, goals, facts, basis }: { base: SimParams; prefs: FormatPrefs; today: string; goals: Goal[]; facts: { label: string; value: number }[]; basis: string }) {
  const [s, setS] = useState({
    years: "5",
    incomeChange: "0",
    expenseChange: "0",
    extraInvest: "0",
    returnPct: String(base.annualReturnPct),
    incomeGrowth: String(base.annualIncomeGrowthPct),
    inflation: String(base.inflationPct),
    prepayLoan: "0",
    prepayAmount: "0",
    prepayMonth: "6",
    purchase: "0",
    purchaseMonth: "12",
    windfall: "0",
    windfallMonth: "12",
  });
  const set = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setS((x) => ({ ...x, [k]: e.target.value }));
  const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const money = (v: string) => parseMoney(v || "0") ?? 0;

  const { baseline, scenario, months } = useMemo(() => {
    const months = Math.min(360, Math.max(12, Math.round(num(s.years) * 12)));
    const common = { ...base, months, annualIncomeGrowthPct: num(s.incomeGrowth), inflationPct: num(s.inflation), annualReturnPct: num(s.returnPct) };
    const baseline = simulate(common, today);
    const events: NonNullable<SimParams["events"]> = [];
    if (money(s.prepayAmount) > 0 && base.loans.length) events.push({ kind: "PREPAYMENT", amount: money(s.prepayAmount), month: Math.max(1, num(s.prepayMonth)), loanIndex: num(s.prepayLoan) });
    if (money(s.purchase) > 0) events.push({ kind: "PURCHASE", amount: money(s.purchase), month: Math.max(1, num(s.purchaseMonth)) });
    if (money(s.windfall) > 0) events.push({ kind: "WINDFALL", amount: money(s.windfall), month: Math.max(1, num(s.windfallMonth)) });
    const scenario = simulate(
      {
        ...common,
        monthlyIncome: Math.round(base.monthlyIncome * (1 + num(s.incomeChange) / 100)),
        monthlyExpenses: Math.round(base.monthlyExpenses * (1 + num(s.expenseChange) / 100)),
        monthlyInvestment: base.monthlyInvestment + money(s.extraInvest),
        events,
      },
      today,
    );
    return { baseline, scenario, months };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, base, today]);

  const end = { b: baseline.at(-1)!, s: scenario.at(-1)! };
  const f = (v: number) => formatMoney(v, prefs, { compact: true });
  const extraMonthly = Math.round((scenario.reduce((a, p) => a + p.savings, 0) - baseline.reduce((a, p) => a + p.savings, 0)) / months);
  const data = baseline.map((p, i) => ({ x: p.month, base: p.netWorth, scen: scenario[i].netWorth, cashB: p.cash, cashS: scenario[i].cash, debtB: p.debt, debtS: scenario[i].debt }));
  const debtFree = (pts: typeof baseline) => pts.find((p) => p.debt - base.otherLiabilities <= 0)?.month;
  const inp = "num h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px]";
  const field = (k: keyof typeof s, label: string, suffix?: string) => (
    <label key={k} className="text-[12px] font-medium text-fg-2">
      {label}
      <span className="mt-1 flex items-center gap-1">
        <input className={inp} inputMode="decimal" value={s[k]} onChange={set(k)} />
        {suffix && <span className="text-muted">{suffix}</span>}
      </span>
    </label>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-4">
        <Card className="p-5">
          <p className="mb-1 text-[13.5px] font-semibold">Historical facts (starting point)</p>
          <p className="mb-3 text-[11.5px] text-muted">From your records · {basis}</p>
          <dl className="space-y-1 text-[12.5px]">
            {facts.map((x) => (
              <div key={x.label} className="flex justify-between gap-3">
                <dt className="text-fg-2">{x.label}</dt>
                <dd className="num">{formatMoney(x.value, prefs)}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <p className="mb-1 text-[13.5px] font-semibold text-ai">Your assumptions</p>
          <p className="mb-3 text-[11.5px] text-muted">Applied to both baseline and scenario</p>
          <div className="grid grid-cols-2 gap-3">
            {field("years", "Horizon", "yrs")}
            {field("returnPct", "Investment return", "%")}
            {field("incomeGrowth", "Income growth / yr", "%")}
            {field("inflation", "Expense inflation / yr", "%")}
          </div>
          <p className="mb-3 mt-5 text-[13.5px] font-semibold text-ai">Scenario changes</p>
          <div className="grid grid-cols-2 gap-3">
            {field("incomeChange", "Income change", "%")}
            {field("expenseChange", "Expense change", "%")}
            {field("extraInvest", "Extra investing / mo")}
            <div />
            {base.loans.length > 0 && (
              <>
                <label className="col-span-2 text-[12px] font-medium text-fg-2">
                  Prepay loan
                  <select className={`${inp} mt-1`} value={s.prepayLoan} onChange={set("prepayLoan")}>
                    {base.loans.map((l, i) => (
                      <option key={l.name} value={i}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
                {field("prepayAmount", "Prepayment amount")}
                {field("prepayMonth", "In month #")}
              </>
            )}
            {field("purchase", "Large purchase")}
            {field("purchaseMonth", "In month #")}
            {field("windfall", "Windfall (bonus, sale)")}
            {field("windfallMonth", "In month #")}
          </div>
        </Card>
      </div>
      <div className="space-y-4 lg:col-span-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Net worth", end.b.netWorth, end.s.netWorth],
            ["Cash", end.b.cash, end.s.cash],
            ["Investments", end.b.investments, end.s.investments],
            ["Debt", end.b.debt, end.s.debt],
          ].map(([l, b, sc]) => (
            <Card key={l as string} className="p-4">
              <p className="text-[12px] text-fg-2">
                {l} in {s.years} yrs
              </p>
              <p className="num mt-1 text-[17px] font-semibold">{f(sc as number)}</p>
              <p className={cx("num text-[12px]", (sc as number) - (b as number) === 0 ? "text-muted" : ((sc as number) > (b as number)) === (l !== "Debt") ? "text-pos" : "text-neg")}>
                {formatMoney((sc as number) - (b as number), prefs, { compact: true, sign: true })} vs baseline
              </p>
            </Card>
          ))}
        </div>
        <ChartFrame
          title="Projected net worth"
          subtitle="Estimate · solid = baseline (current trends), dashed = your scenario"
          legend={[{ label: "Baseline", slot: 0 }, { label: "Scenario", slot: 6, dashed: true }]}
          table={{ columns: ["Month", "Baseline", "Scenario"], rows: data.filter((_, i) => i % 6 === 5).map((d) => [d.x, formatMoney(d.base, prefs), formatMoney(d.scen, prefs)]) }}
        >
          <TrendChart prefs={prefs} xKey="x" data={data} series={[{ key: "base", name: "Baseline", slot: 0 }, { key: "scen", name: "Scenario", slot: 6, dashed: true }]} xFormat="month" height={260} />
        </ChartFrame>
        <div className="grid gap-4 md:grid-cols-2">
          <ChartFrame title="Cash balance" legend={[{ label: "Baseline", slot: 0 }, { label: "Scenario", slot: 6, dashed: true }]}>
            <TrendChart prefs={prefs} xKey="x" data={data} series={[{ key: "cashB", name: "Baseline", slot: 0, type: "line" }, { key: "cashS", name: "Scenario", slot: 6, dashed: true }]} xFormat="month" height={180} zeroLine />
          </ChartFrame>
          <ChartFrame title="Debt reduction" legend={[{ label: "Baseline", slot: 1 }, { label: "Scenario", slot: 6, dashed: true }]}>
            <TrendChart prefs={prefs} xKey="x" data={data} series={[{ key: "debtB", name: "Baseline", slot: 1, type: "line" }, { key: "debtS", name: "Scenario", slot: 6, dashed: true }]} xFormat="month" height={180} />
          </ChartFrame>
        </div>
        <Card>
          <CardHeader title="Goal completion" subtitle={`Scenario changes your average monthly savings by ${formatMoney(extraMonthly, prefs, { sign: true })} — applied to goals in priority order`} />
          <ul className="divide-y divide-line">
            {goals.map((g, i) => {
              const bm = monthsToTarget(0, g.remaining, g.monthly);
              const sm = monthsToTarget(0, g.remaining, Math.max(0, g.monthly + (i === 0 ? extraMonthly : 0)));
              return (
                <li key={g.name} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-right text-[12.5px]">
                    <span className="text-muted">baseline </span>
                    {bm == null ? "never" : formatDate(addMonths(today, bm), prefs.dateFormat)}
                    <span className="text-muted"> → scenario </span>
                    <b>{sm == null ? "never" : formatDate(addMonths(today, sm), prefs.dateFormat)}</b>
                  </span>
                </li>
              );
            })}
            {!goals.length && <li className="px-5 py-5 text-center text-[13px] text-muted">No active goals.</li>}
            {base.loans.length > 0 && (
              <li className="flex justify-between px-5 py-2.5 text-[13px]">
                <span className="font-medium">Loan-free</span>
                <span className="text-[12.5px]">
                  <span className="text-muted">baseline </span>
                  {debtFree(baseline) ?? `after ${s.years} yrs`} <span className="text-muted">→ scenario </span>
                  <b>{debtFree(scenario) ?? `after ${s.years} yrs`}</b>
                </span>
              </li>
            )}
          </ul>
        </Card>
        <Notice tone="ai">Projections are estimates. Baseline extends your recorded averages; every number above depends on the assumptions shown on the left. Monthly investing is capped at available cash.</Notice>
      </div>
    </div>
  );
}
