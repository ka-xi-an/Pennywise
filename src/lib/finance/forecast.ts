/**
 * Forecasting & simulation. Every output here is an ESTIMATE driven by explicit
 * assumptions; callers must present the assumptions next to the numbers and keep
 * projections visually distinct from recorded history.
 */
import type { ISODate, Minor } from "./types";
import { addMonths, monthKey } from "./dates";
import { computeEMI, monthlyRate } from "./loans";
import { roundMinor } from "./money";

export interface SimLoan {
  name: string;
  outstanding: Minor;
  ratePct: number;
  emi: Minor;
}

export interface SimParams {
  months: number;
  startCash: Minor;
  startInvestments: Minor;
  otherAssets: Minor;
  otherLiabilities: Minor;
  loans: SimLoan[];
  monthlyIncome: Minor;
  monthlyExpenses: Minor; // excluding EMIs
  monthlyInvestment: Minor; // SIPs etc. moved from cash to investments
  annualReturnPct: number;
  annualIncomeGrowthPct: number;
  inflationPct: number;
  /** one-off events by month index (1-based) */
  events?: { month: number; kind: "PURCHASE" | "PREPAYMENT" | "WINDFALL"; amount: Minor; loanIndex?: number }[];
}

export interface SimPoint {
  month: string;
  cash: Minor;
  investments: Minor;
  debt: Minor;
  netWorth: Minor;
  income: Minor;
  expenses: Minor;
  savings: Minor;
}

export function simulate(p: SimParams, today: ISODate): SimPoint[] {
  let cash = p.startCash;
  let inv = p.startInvestments;
  const loans = p.loans.map((l) => ({ ...l }));
  const r = Math.pow(1 + p.annualReturnPct / 100, 1 / 12) - 1;
  const out: SimPoint[] = [];
  for (let m = 1; m <= p.months; m++) {
    const yearsElapsed = Math.floor((m - 1) / 12);
    const income = roundMinor(p.monthlyIncome * Math.pow(1 + p.annualIncomeGrowthPct / 100, yearsElapsed));
    const expenses = roundMinor(p.monthlyExpenses * Math.pow(1 + p.inflationPct / 100, yearsElapsed));
    let emiPaid = 0;
    let interestPaid = 0;
    for (const l of loans) {
      if (l.outstanding <= 0) continue;
      const interest = roundMinor(l.outstanding * monthlyRate(l.ratePct));
      const pay = Math.min(l.emi, l.outstanding + interest);
      l.outstanding -= pay - interest;
      emiPaid += pay;
      interestPaid += interest;
    }
    inv = roundMinor(inv * (1 + r));
    cash += income - expenses - emiPaid;
    const invest = Math.min(p.monthlyInvestment, Math.max(0, cash));
    cash -= invest;
    inv += invest;
    for (const e of p.events ?? []) {
      if (e.month !== m) continue;
      if (e.kind === "PURCHASE") cash -= e.amount;
      if (e.kind === "WINDFALL") cash += e.amount;
      if (e.kind === "PREPAYMENT") {
        const l = loans[e.loanIndex ?? 0];
        if (l) {
          const amt = Math.min(e.amount, l.outstanding);
          l.outstanding -= amt;
          cash -= amt;
        }
      }
    }
    const debt = loans.reduce((s, l) => s + Math.max(0, l.outstanding), 0) + p.otherLiabilities;
    out.push({
      month: monthKey(addMonths(today, m)),
      cash,
      investments: inv,
      debt,
      netWorth: cash + inv + p.otherAssets - debt,
      income,
      expenses: expenses + interestPaid,
      savings: income - expenses - interestPaid,
    });
  }
  return out;
}

/**
 * Simple cash-balance forecast: starting liquid cash plus the trailing average
 * monthly NET CASH FLOW (which already includes EMIs and investment contributions).
 */
export function cashForecast(startCash: Minor, avgNetCashFlow: Minor, months: number, today: ISODate) {
  return Array.from({ length: months }, (_, i) => ({
    month: monthKey(addMonths(today, i + 1)),
    cash: startCash + avgNetCashFlow * (i + 1),
  }));
}

export interface RetirementParams {
  currentAge: number;
  retireAge: number;
  lifeExpectancy: number;
  monthlyExpensesToday: Minor;
  inflationPct: number;
  preReturnPct: number;
  postReturnPct: number;
  currentCorpus: Minor;
  monthlySip: Minor;
  sipStepUpPct: number;
}

export function retirementPlan(p: RetirementParams) {
  const yearsToRetire = Math.max(0, p.retireAge - p.currentAge);
  const yearsInRetirement = Math.max(0, p.lifeExpectancy - p.retireAge);
  const expensesAtRetirement = p.monthlyExpensesToday * Math.pow(1 + p.inflationPct / 100, yearsToRetire);
  // Corpus needed: present value at retirement of inflation-growing monthly withdrawals.
  const rPost = Math.pow(1 + p.postReturnPct / 100, 1 / 12) - 1;
  const g = Math.pow(1 + p.inflationPct / 100, 1 / 12) - 1;
  const n = yearsInRetirement * 12;
  let corpusNeeded: number;
  if (Math.abs(rPost - g) < 1e-12) corpusNeeded = expensesAtRetirement * n;
  else corpusNeeded = (expensesAtRetirement * (1 - Math.pow((1 + g) / (1 + rPost), n))) / (rPost - g);

  const rPre = Math.pow(1 + p.preReturnPct / 100, 1 / 12) - 1;
  const series: { age: number; corpus: Minor; phase: "accumulation" | "retirement" }[] = [];
  let corpus = p.currentCorpus;
  let sip = p.monthlySip;
  for (let y = 0; y < yearsToRetire; y++) {
    for (let m = 0; m < 12; m++) corpus = corpus * (1 + rPre) + sip;
    sip *= 1 + p.sipStepUpPct / 100;
    series.push({ age: p.currentAge + y + 1, corpus: Math.round(corpus), phase: "accumulation" });
  }
  const projectedCorpus = corpus;
  let draw = expensesAtRetirement;
  let depletedAge: number | null = null;
  for (let y = 0; y < yearsInRetirement; y++) {
    for (let m = 0; m < 12; m++) {
      corpus = corpus * (1 + rPost) - draw;
      draw *= 1 + g;
    }
    if (corpus < 0 && depletedAge == null) depletedAge = p.retireAge + y + 1;
    series.push({ age: p.retireAge + y + 1, corpus: Math.round(Math.max(0, corpus)), phase: "retirement" });
  }
  // Required level monthly SIP (with the same step-up) to reach the corpus.
  const fvOf = (s0: number) => {
    let c = p.currentCorpus;
    let s = s0;
    for (let y = 0; y < yearsToRetire; y++) {
      for (let m = 0; m < 12; m++) c = c * (1 + rPre) + s;
      s *= 1 + p.sipStepUpPct / 100;
    }
    return c;
  };
  let lo = 0,
    hi = Math.max(corpusNeeded, 1);
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (fvOf(mid) >= corpusNeeded) hi = mid;
    else lo = mid;
  }
  return {
    yearsToRetire,
    yearsInRetirement,
    expensesAtRetirement: Math.round(expensesAtRetirement),
    corpusNeeded: Math.round(corpusNeeded),
    projectedCorpus: Math.round(projectedCorpus),
    gap: Math.round(corpusNeeded - projectedCorpus),
    requiredSip: yearsToRetire > 0 ? Math.ceil(hi) : null,
    depletedAge,
    series,
  };
}

export { computeEMI };
