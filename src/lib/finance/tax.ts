/**
 * India-oriented tax ESTIMATION. Rules are user-editable per financial year and
 * regime (TaxRuleSet) — nothing here is assumed to persist across years. Results are
 * planning estimates, NOT an official computation or filing advice.
 *
 * Not modelled (shown to the user): surcharge & marginal relief, special-rate
 * incomes other than listed capital gains, rebate interaction with special-rate
 * income, set-off/carry-forward of losses, agricultural income, and age-based slabs.
 */
import type { Minor } from "./types";
import { daysBetween } from "./dates";
import { EQUITY_CLASSES, type AssetClass } from "./investments";

export interface Slab {
  upTo: Minor | null; // upper bound of the slab in minor units; null = no limit
  ratePct: number;
}

export interface TaxConfig {
  slabs: Slab[];
  standardDeduction: Minor;
  rebateIncomeLimit: Minor; // 87A: taxable income at or below this…
  rebateMax: Minor; // …gets a rebate up to this amount
  cessPct: number;
  deductionsAllowed: boolean; // old regime: chapter VI-A deductions
  deductionCaps: Record<string, Minor>; // per section caps (minor units)
  stcgEquityPct: number;
  ltcgEquityPct: number;
  ltcgEquityExemption: Minor;
  equityLtcgMonths: number;
  otherLtcgMonths: number;
  otherLtcgPct: number;
}

const L = (lakhs: number) => Math.round(lakhs * 100000 * 100);
const R = (rupees: number) => rupees * 100;

const CG_FY2526 = {
  stcgEquityPct: 20,
  ltcgEquityPct: 12.5,
  ltcgEquityExemption: R(125000),
  equityLtcgMonths: 12,
  otherLtcgMonths: 24,
  otherLtcgPct: 12.5,
};

/** Editable templates. Users must verify against official sources before relying on them. */
export const TAX_TEMPLATES: Record<string, Record<"NEW" | "OLD", TaxConfig>> = {
  "2025-26": {
    NEW: {
      slabs: [
        { upTo: L(4), ratePct: 0 },
        { upTo: L(8), ratePct: 5 },
        { upTo: L(12), ratePct: 10 },
        { upTo: L(16), ratePct: 15 },
        { upTo: L(20), ratePct: 20 },
        { upTo: L(24), ratePct: 25 },
        { upTo: null, ratePct: 30 },
      ],
      standardDeduction: R(75000),
      rebateIncomeLimit: L(12),
      rebateMax: R(60000),
      cessPct: 4,
      deductionsAllowed: false,
      deductionCaps: { "80CCD2": L(100) },
      ...CG_FY2526,
    },
    OLD: {
      slabs: [
        { upTo: L(2.5), ratePct: 0 },
        { upTo: L(5), ratePct: 5 },
        { upTo: L(10), ratePct: 20 },
        { upTo: null, ratePct: 30 },
      ],
      standardDeduction: R(50000),
      rebateIncomeLimit: L(5),
      rebateMax: R(12500),
      cessPct: 4,
      deductionsAllowed: true,
      deductionCaps: {
        "80C": L(1.5),
        "80CCD1B": R(50000),
        "80D": R(25000),
        "80E": L(1000),
        "80G": L(1000),
        "80TTA": R(10000),
        "24B": L(2),
        HRA: L(1000),
        OTHER: L(1000),
      },
      ...CG_FY2526,
    },
  },
};

export const DEDUCTION_SECTIONS: Record<string, string> = {
  "80C": "80C — PPF, ELSS, EPF, LIC, principal on home loan, tuition",
  "80CCD1B": "80CCD(1B) — additional NPS contribution",
  "80CCD2": "80CCD(2) — employer NPS contribution",
  "80D": "80D — health insurance premium",
  "80E": "80E — education loan interest",
  "80G": "80G — donations",
  "80TTA": "80TTA — savings account interest",
  "24B": "24(b) — home loan interest",
  HRA: "HRA exemption",
  OTHER: "Other",
};

export function slabTax(income: Minor, slabs: Slab[]): Minor {
  let tax = 0;
  let lower = 0;
  for (const s of slabs) {
    const upper = s.upTo ?? Infinity;
    if (income > lower) tax += ((Math.min(income, upper) - lower) * s.ratePct) / 100;
    lower = upper;
    if (income <= upper) break;
  }
  return Math.round(tax);
}

export interface TaxInputs {
  salary: Minor;
  otherIncome: Minor; // interest, dividends, rent, freelance (net), etc.
  stcgEquity: Minor;
  ltcgEquity: Minor;
  stcgOther: Minor; // taxed at slab
  ltcgOther: Minor;
  deductions: Record<string, Minor>; // by section, claimed amounts
  tdsPaid: Minor;
}

export interface TaxEstimate {
  grossTotalIncome: Minor;
  standardDeduction: Minor;
  deductionsAllowed: Minor;
  deductionDetail: { section: string; claimed: Minor; allowed: Minor }[];
  taxableNormalIncome: Minor;
  slabTax: Minor;
  rebate: Minor;
  stcgEquityTax: Minor;
  ltcgEquityTax: Minor;
  ltcgOtherTax: Minor;
  taxBeforeCess: Minor;
  cess: Minor;
  totalTax: Minor;
  tdsPaid: Minor;
  balancePayable: Minor;
}

export function estimateTax(i: TaxInputs, c: TaxConfig): TaxEstimate {
  const stdDed = i.salary > 0 ? Math.min(c.standardDeduction, i.salary) : 0;
  const deductionDetail = Object.entries(i.deductions).map(([section, claimed]) => {
    const cap = c.deductionCaps[section];
    const allowed = !c.deductionsAllowed && section !== "80CCD2" ? 0 : Math.min(claimed, cap ?? claimed);
    return { section, claimed, allowed };
  });
  const deductionsAllowed = deductionDetail.reduce((s, d) => s + d.allowed, 0);
  const normal = i.salary + i.otherIncome + i.stcgOther + 0;
  const taxableNormalIncome = Math.max(0, normal - stdDed - deductionsAllowed);
  const st = slabTax(taxableNormalIncome, c.slabs);
  const totalTaxable = taxableNormalIncome + i.stcgEquity + i.ltcgEquity + i.ltcgOther;
  const rebate = totalTaxable <= c.rebateIncomeLimit ? Math.min(st, c.rebateMax) : 0;
  const stcgEquityTax = Math.round((Math.max(0, i.stcgEquity) * c.stcgEquityPct) / 100);
  const ltcgEquityTax = Math.round((Math.max(0, i.ltcgEquity - c.ltcgEquityExemption) * c.ltcgEquityPct) / 100);
  const ltcgOtherTax = Math.round((Math.max(0, i.ltcgOther) * c.otherLtcgPct) / 100);
  const taxBeforeCess = Math.max(0, st - rebate) + stcgEquityTax + ltcgEquityTax + ltcgOtherTax;
  const cess = Math.round((taxBeforeCess * c.cessPct) / 100);
  const totalTax = taxBeforeCess + cess;
  return {
    grossTotalIncome: normal + i.stcgEquity + i.ltcgEquity + i.ltcgOther,
    standardDeduction: stdDed,
    deductionsAllowed,
    deductionDetail,
    taxableNormalIncome,
    slabTax: st,
    rebate,
    stcgEquityTax,
    ltcgEquityTax,
    ltcgOtherTax,
    taxBeforeCess,
    cess,
    totalTax,
    tdsPaid: i.tdsPaid,
    balancePayable: totalTax - i.tdsPaid,
  };
}

/** Classify a realised gain as short/long term by asset class and holding period. */
export function classifyGain(
  assetClass: AssetClass,
  acquired: string | null,
  sold: string,
  c: Pick<TaxConfig, "equityLtcgMonths" | "otherLtcgMonths">,
): { term: "SHORT" | "LONG"; equity: boolean } {
  const equity = EQUITY_CLASSES.includes(assetClass);
  if (!acquired) return { term: "SHORT", equity };
  const months = equity ? c.equityLtcgMonths : c.otherLtcgMonths;
  const days = daysBetween(acquired, sold);
  return { term: days > months * 30.4375 ? "LONG" : "SHORT", equity };
}

export const TAX_NOT_MODELLED = [
  "Surcharge and marginal relief",
  "Age-based slabs (senior / super-senior citizens)",
  "Rebate restrictions on special-rate income",
  "Set-off and carry-forward of losses",
  "Debt mutual funds bought after 1 Apr 2023 (always slab rate) — classify manually",
  "Grandfathering of pre-2018 equity gains and indexation choices",
];
