/**
 * Goal projections. With an expected annual return r (user assumption) contributions
 * compound monthly: FV = PV(1+i)^n + C·((1+i)^n − 1)/i, i = r/12.
 * With no return assumption the projection is linear.
 */
import type { ISODate, Minor } from "./types";
import { addMonths, daysBetween } from "./dates";

export const GOAL_TYPES = [
  "EMERGENCY_FUND",
  "HOUSE",
  "VEHICLE",
  "VACATION",
  "EDUCATION",
  "RETIREMENT",
  "DEBT_FREE",
  "SAVINGS",
  "NET_WORTH",
  "OTHER",
] as const;
export const GOAL_TYPE_LABELS: Record<string, string> = {
  EMERGENCY_FUND: "Emergency fund",
  HOUSE: "House purchase",
  VEHICLE: "Vehicle purchase",
  VACATION: "Vacation",
  EDUCATION: "Education",
  RETIREMENT: "Retirement",
  DEBT_FREE: "Debt freedom",
  SAVINGS: "Savings milestone",
  NET_WORTH: "Net worth target",
  OTHER: "Other",
};

export function monthsBetween(from: ISODate, to: ISODate): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let m = (ty - fy) * 12 + (tm - fm);
  if (td < fd) m -= 1;
  return Math.max(0, m);
}

/** Months needed to reach target from current with monthly contribution (null if never). */
export function monthsToTarget(current: Minor, target: Minor, monthly: Minor, annualReturnPct = 0): number | null {
  if (current >= target) return 0;
  const i = annualReturnPct / 12 / 100;
  if (monthly <= 0 && i <= 0) return null;
  if (i === 0) return Math.ceil((target - current) / monthly);
  // Solve FV(n) >= target numerically (bounded to 100 years).
  let bal = current;
  for (let n = 1; n <= 1200; n++) {
    bal = bal * (1 + i) + monthly;
    if (bal >= target) return n;
  }
  return null;
}

/** Monthly contribution required to reach target by targetDate. */
export function requiredMonthly(current: Minor, target: Minor, months: number, annualReturnPct = 0): Minor | null {
  if (current >= target) return 0;
  if (months <= 0) return null;
  const i = annualReturnPct / 12 / 100;
  if (i === 0) return Math.ceil((target - current) / months);
  const f = Math.pow(1 + i, months);
  const needed = target - current * f;
  if (needed <= 0) return 0;
  return Math.ceil((needed * i) / (f - 1));
}

export interface GoalProgress {
  current: Minor;
  target: Minor;
  remaining: Minor;
  pct: number;
  monthsLeft: number | null;
  required: Minor | null;
  projectedDate: ISODate | null;
  onTrack: boolean | null;
  milestone: 0 | 25 | 50 | 75 | 100;
}

export function goalProgress(
  g: { targetAmount: Minor; targetDate: ISODate | null; monthlyContribution: Minor; expectedReturn: string | null },
  current: Minor,
  today: ISODate,
): GoalProgress {
  const ret = g.expectedReturn ? Number(g.expectedReturn) || 0 : 0;
  const remaining = Math.max(0, g.targetAmount - current);
  const pct = g.targetAmount > 0 ? Math.min(100, Math.max(0, (current / g.targetAmount) * 100)) : 0;
  const monthsLeft = g.targetDate ? (daysBetween(today, g.targetDate) < 0 ? 0 : monthsBetween(today, g.targetDate)) : null;
  const required = monthsLeft != null ? requiredMonthly(current, g.targetAmount, Math.max(1, monthsLeft), ret) : null;
  const n = monthsToTarget(current, g.targetAmount, g.monthlyContribution, ret);
  const projectedDate = n == null ? null : addMonths(today, n);
  const onTrack =
    remaining === 0 ? true : g.targetDate && projectedDate ? projectedDate <= g.targetDate : g.targetDate ? false : null;
  const milestone = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0;
  return { current, target: g.targetAmount, remaining, pct, monthsLeft, required, projectedDate, onTrack, milestone };
}
