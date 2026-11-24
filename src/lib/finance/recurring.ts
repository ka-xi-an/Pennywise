/**
 * Recurring schedules (bills, subscriptions, EMIs, salary…). Occurrence dates are
 * generated from the rule; their PAID/SKIPPED state lives in RecurringOccurrence rows.
 * Monthly-type schedules keep the start date's day-of-month (clamped to month length).
 */
import type { ISODate, Minor } from "./types";
import { addDays, addMonths, daysBetween } from "./dates";

export const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  HALF_YEARLY: "Half-yearly",
  YEARLY: "Yearly",
};

export interface RuleLike {
  frequency: Frequency;
  interval: number;
  startDate: ISODate;
  endDate: ISODate | null;
}

function step(rule: RuleLike, n: number): ISODate {
  const k = n * Math.max(1, rule.interval);
  const day = Number(rule.startDate.slice(8, 10));
  switch (rule.frequency) {
    case "DAILY":
      return addDays(rule.startDate, k);
    case "WEEKLY":
      return addDays(rule.startDate, 7 * k);
    case "QUARTERLY":
      return addMonths(rule.startDate, 3 * k, day);
    case "HALF_YEARLY":
      return addMonths(rule.startDate, 6 * k, day);
    case "YEARLY":
      return addMonths(rule.startDate, 12 * k, day);
    case "MONTHLY":
    default:
      return addMonths(rule.startDate, k, day);
  }
}

/** All occurrence dates of a rule within [from, to]. */
export function occurrencesBetween(rule: RuleLike, from: ISODate, to: ISODate, limit = 1000): ISODate[] {
  const out: ISODate[] = [];
  for (let n = 0; n < 100000 && out.length < limit; n++) {
    const d = step(rule, n);
    if (d > to || (rule.endDate && d > rule.endDate)) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export function nextOccurrence(rule: RuleLike, onOrAfter: ISODate): ISODate | null {
  return occurrencesBetween(rule, onOrAfter, addDays(onOrAfter, 800), 1)[0] ?? null;
}

/** Number of occurrences per year (used for annualised subscription cost). */
export function perYear(rule: Pick<RuleLike, "frequency" | "interval">): number {
  const i = Math.max(1, rule.interval);
  switch (rule.frequency) {
    case "DAILY":
      return 365 / i;
    case "WEEKLY":
      return 52 / i;
    case "MONTHLY":
      return 12 / i;
    case "QUARTERLY":
      return 4 / i;
    case "HALF_YEARLY":
      return 2 / i;
    case "YEARLY":
      return 1 / i;
  }
}

export function annualCost(amount: Minor, rule: Pick<RuleLike, "frequency" | "interval">): Minor {
  return Math.round(amount * perYear(rule));
}

export function monthlyEquivalent(amount: Minor, rule: Pick<RuleLike, "frequency" | "interval">): Minor {
  return Math.round((amount * perYear(rule)) / 12);
}

export type OccurrenceState = "PAID" | "SKIPPED" | "OVERDUE" | "DUE_SOON" | "UPCOMING";

export function occurrenceState(
  due: ISODate,
  today: ISODate,
  recorded: "PAID" | "SKIPPED" | undefined,
  reminderDays: number,
): OccurrenceState {
  if (recorded) return recorded;
  if (due < today) return "OVERDUE";
  if (daysBetween(today, due) <= reminderDays) return "DUE_SOON";
  return "UPCOMING";
}
