/**
 * Loan mathematics (reducing-balance, monthly compounding — the standard for Indian
 * home / vehicle / personal loans).
 *
 *   r   = annualRate / 12 / 100
 *   EMI = P · r · (1+r)^n / ((1+r)^n − 1)      (EMI = P / n when r = 0)
 *
 * Each month: interest = round(opening × r); principal = EMI − interest.
 * The final instalment is trimmed so the balance closes at exactly zero.
 */
import type { ISODate, Minor } from "./types";
import { addMonths } from "./dates";
import { roundMinor } from "./money";

export function monthlyRate(annualRatePct: number): number {
  return annualRatePct / 12 / 100;
}

export function computeEMI(principal: Minor, annualRatePct: number, months: number): Minor {
  if (principal <= 0 || months <= 0) return 0;
  const r = monthlyRate(annualRatePct);
  if (r === 0) return Math.ceil(principal / months);
  const f = Math.pow(1 + r, months);
  // Rounded UP to the minor unit (as lenders do) so the loan closes within `months`.
  return Math.ceil((principal * r * f) / (f - 1) - 1e-9);
}

export interface ScheduleRow {
  n: number;
  date: ISODate;
  opening: Minor;
  payment: Minor;
  interest: Minor;
  principal: Minor;
  prepayment: Minor;
  closing: Minor;
}

export interface Schedule {
  rows: ScheduleRow[];
  totalInterest: Minor;
  totalPaid: Minor;
  months: number;
  payoffDate: ISODate | null;
  /** true when the EMI does not cover monthly interest (balance would never reduce) */
  negativeAmortization: boolean;
}

/**
 * Amortization schedule from an outstanding balance.
 * @param firstDate date of the next instalment
 * @param prepayments optional lump-sum prepayments keyed by instalment number (applied after that EMI)
 */
export function amortize(
  outstanding: Minor,
  annualRatePct: number,
  emi: Minor,
  firstDate: ISODate,
  opts: { maxMonths?: number; prepayments?: Record<number, Minor>; recurringExtra?: Minor } = {},
): Schedule {
  const r = monthlyRate(annualRatePct);
  const rows: ScheduleRow[] = [];
  let bal = outstanding;
  let totalInterest = 0;
  let totalPaid = 0;
  const max = opts.maxMonths ?? 600;
  const anchorDay = Number(firstDate.slice(8, 10));
  for (let n = 1; bal > 0 && n <= max; n++) {
    const interest = roundMinor(bal * r);
    if (emi <= interest && !opts.prepayments?.[n] && !opts.recurringExtra) {
      return { rows, totalInterest, totalPaid, months: rows.length, payoffDate: null, negativeAmortization: true };
    }
    let payment = Math.min(emi, bal + interest);
    let principal = payment - interest;
    let closing = bal - principal;
    // Lenders fold a tiny residual (from EMI rounding) into the final instalment.
    if (closing > 0 && closing <= Math.max(100, Math.round(emi * 0.02)) && !opts.prepayments?.[n + 1]) {
      payment += closing;
      principal += closing;
      closing = 0;
    }
    let prepayment = Math.min((opts.prepayments?.[n] ?? 0) + (opts.recurringExtra ?? 0), closing);
    closing -= prepayment;
    rows.push({
      n,
      date: addMonths(firstDate, n - 1, anchorDay),
      opening: bal,
      payment,
      interest,
      principal,
      prepayment,
      closing,
    });
    totalInterest += interest;
    totalPaid += payment + prepayment;
    bal = closing;
  }
  return {
    rows,
    totalInterest,
    totalPaid,
    months: rows.length,
    payoffDate: rows.at(-1)?.date ?? null,
    negativeAmortization: false,
  };
}

/** Interest / principal split for a single payment against an outstanding balance. */
export function splitPayment(outstanding: Minor, annualRatePct: number, payment: Minor) {
  const interest = Math.min(roundMinor(outstanding * monthlyRate(annualRatePct)), payment);
  const principal = Math.min(payment - interest, outstanding);
  return { interest, principal, excess: payment - interest - principal };
}

/** Number of remaining monthly instalments for an outstanding balance at a given EMI. */
export function remainingTenure(outstanding: Minor, annualRatePct: number, emi: Minor): number | null {
  const r = monthlyRate(annualRatePct);
  if (outstanding <= 0) return 0;
  if (r === 0) return Math.ceil(outstanding / emi);
  if (emi <= outstanding * r) return null;
  return Math.ceil(-Math.log(1 - (outstanding * r) / emi) / Math.log(1 + r));
}

export interface PrepaymentResult {
  baseline: Schedule;
  scenario: Schedule;
  interestSaved: Minor;
  monthsSaved: number;
  newEmi: Minor | null;
}

/**
 * Compare a lump-sum prepayment (applied now, before the next EMI) under the two
 * standard bank options: keep EMI & reduce tenure, or keep tenure & reduce EMI.
 */
export function prepaymentScenario(
  outstanding: Minor,
  annualRatePct: number,
  emi: Minor,
  firstDate: ISODate,
  lumpSum: Minor,
  mode: "REDUCE_TENURE" | "REDUCE_EMI",
  extraMonthly: Minor = 0,
): PrepaymentResult {
  const baseline = amortize(outstanding, annualRatePct, emi, firstDate);
  const reduced = Math.max(0, outstanding - lumpSum);
  let scenario: Schedule;
  let newEmi: Minor | null = null;
  if (mode === "REDUCE_EMI") {
    newEmi = computeEMI(reduced, annualRatePct, baseline.months);
    scenario = amortize(reduced, annualRatePct, newEmi, firstDate, { recurringExtra: extraMonthly });
  } else {
    scenario = amortize(reduced, annualRatePct, emi, firstDate, { recurringExtra: extraMonthly });
  }
  return {
    baseline,
    scenario,
    interestSaved: baseline.totalInterest - scenario.totalInterest,
    monthsSaved: baseline.months - scenario.months,
    newEmi,
  };
}

/** Next instalment date strictly after `today` on the given day of month. */
export function nextEmiDate(today: ISODate, day: number): ISODate {
  const d = `${today.slice(0, 8)}${String(Math.min(28, Math.max(1, day))).padStart(2, "0")}`;
  return d > today ? d : addMonths(d, 1);
}

export const LOAN_TYPES = ["HOME", "PERSONAL", "VEHICLE", "EDUCATION", "BUSINESS", "GOLD", "OTHER"] as const;
export const LOAN_TYPE_LABELS: Record<string, string> = {
  HOME: "Home loan",
  PERSONAL: "Personal loan",
  VEHICLE: "Vehicle loan",
  EDUCATION: "Education loan",
  BUSINESS: "Business loan",
  GOLD: "Gold loan",
  OTHER: "Other loan",
};
