import "server-only";
import type { Ctx } from "./data";
import { keyMetrics, lastCompleteMonths } from "./data";
import type { SimParams } from "../finance/forecast";

/**
 * Starting point for projections, derived from recorded data (facts), plus default
 * assumptions that are always shown and editable. Income/expenses are trailing
 * averages over the last complete months; loan interest is excluded from expenses
 * because the simulation amortizes loans explicitly.
 */
export function simBase(ctx: Ctx): { params: SimParams; facts: { label: string; value: number }[]; basis: string } {
  const m = keyMetrics(ctx);
  const r = lastCompleteMonths(ctx.today, 3);
  const months = Math.max(1, Math.min(3, m.monthsOfData));
  let interest = 0,
    invest = 0;
  for (const t of ctx.txs) {
    if (t.date < r.from || t.date > r.to) continue;
    if (t.type === "LOAN_REPAYMENT") interest += t.interestAmount ?? 0;
    if (t.type === "INVESTMENT_BUY") invest += t.amount;
    if (t.type === "INVESTMENT_SELL") invest -= t.amount;
  }
  const nw = ctx.netWorth;
  const params: SimParams = {
    months: 60,
    startCash: nw.byGroup.CASH_BANK + nw.byGroup.INVESTMENT_CASH - nw.byGroup.CREDIT_CARDS,
    startInvestments: nw.byGroup.INVESTMENTS,
    otherAssets: nw.byGroup.OTHER_ASSETS,
    otherLiabilities: nw.byGroup.OTHER_LIABILITIES,
    loans: ctx.loans.filter((l) => l.outstanding > 0 && l.status === "ACTIVE").map((l) => ({ name: l.name, outstanding: l.outstanding, ratePct: Number(l.interestRate), emi: l.emi })),
    monthlyIncome: m.avgMonthlyIncome,
    monthlyExpenses: Math.max(0, m.avgMonthlyExpenses - Math.round(interest / months)),
    monthlyInvestment: Math.max(0, Math.round(invest / months)),
    annualReturnPct: 8,
    annualIncomeGrowthPct: 5,
    inflationPct: 6,
  };
  return {
    params,
    basis: m.basis,
    facts: [
      { label: "Cash & bank (net of card dues)", value: params.startCash },
      { label: "Investments", value: params.startInvestments },
      { label: "Loan principal", value: params.loans.reduce((s, l) => s + l.outstanding, 0) },
      { label: "Average monthly income", value: params.monthlyIncome },
      { label: "Average monthly expenses (excl. loan interest)", value: params.monthlyExpenses },
      { label: "Average monthly net investing", value: params.monthlyInvestment },
    ],
  };
}
