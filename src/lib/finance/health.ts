/**
 * Financial Health Score — a transparent, rules-based 0–100 indicator.
 * It is NOT a credit score and does not measure financial security. Each component
 * maps a measured value linearly between a "poor" and "excellent" anchor; components
 * without enough data are excluded and the remaining weights re-normalised.
 */

export interface HealthInputs {
  savingsRate: number | null; // % (trailing 3 months)
  emergencyMonths: number | null; // liquid cash / avg monthly expenses
  debtToIncome: number | null; // % monthly debt payments / monthly income
  debtToAsset: number | null; // %
  expenseVolatility: number | null; // coefficient of variation of monthly expenses (%)
  positiveMonthsRatio: number | null; // % of recent months with positive savings
  diversification: { classes: number; largestPct: number } | null;
  goalsOnTrackPct: number | null;
}

export interface HealthComponent {
  key: keyof HealthInputs;
  label: string;
  weight: number;
  score: number | null;
  display: string;
  rule: string;
  status: "strong" | "fair" | "weak" | "nodata";
}

export interface HealthResult {
  score: number | null;
  band: "Excellent" | "Good" | "Fair" | "Needs attention" | "Insufficient data";
  components: HealthComponent[];
  strengths: string[];
  weaknesses: string[];
}

/** Linear scale between poor (0) and excellent (100), clamped. */
export function scale(value: number, poor: number, excellent: number): number {
  const t = (value - poor) / (excellent - poor);
  return Math.round(Math.max(0, Math.min(1, t)) * 100);
}

const f1 = (n: number) => n.toFixed(1);

export function healthScore(i: HealthInputs): HealthResult {
  const defs: Omit<HealthComponent, "status">[] = [
    {
      key: "savingsRate",
      label: "Savings rate",
      weight: 20,
      score: i.savingsRate == null ? null : scale(i.savingsRate, 0, 30),
      display: i.savingsRate == null ? "—" : `${f1(i.savingsRate)}%`,
      rule: "0% scores 0, 30%+ of income saved scores 100 (trailing 3 months).",
    },
    {
      key: "emergencyMonths",
      label: "Emergency fund coverage",
      weight: 20,
      score: i.emergencyMonths == null ? null : scale(i.emergencyMonths, 0, 6),
      display: i.emergencyMonths == null ? "—" : `${f1(i.emergencyMonths)} months`,
      rule: "Liquid cash ÷ average monthly expenses. 6+ months scores 100.",
    },
    {
      key: "debtToIncome",
      label: "Debt-to-income",
      weight: 15,
      score: i.debtToIncome == null ? null : scale(i.debtToIncome, 50, 10),
      display: i.debtToIncome == null ? "—" : `${f1(i.debtToIncome)}%`,
      rule: "Monthly debt payments ÷ monthly income. ≤10% scores 100, ≥50% scores 0.",
    },
    {
      key: "debtToAsset",
      label: "Debt-to-asset",
      weight: 10,
      score: i.debtToAsset == null ? null : scale(i.debtToAsset, 80, 10),
      display: i.debtToAsset == null ? "—" : `${f1(i.debtToAsset)}%`,
      rule: "Total liabilities ÷ total assets. ≤10% scores 100, ≥80% scores 0.",
    },
    {
      key: "expenseVolatility",
      label: "Expense stability",
      weight: 10,
      score: i.expenseVolatility == null ? null : scale(i.expenseVolatility, 60, 10),
      display: i.expenseVolatility == null ? "—" : `${f1(i.expenseVolatility)}% variation`,
      rule: "Month-to-month variation of spending (6 months). ≤10% scores 100, ≥60% scores 0.",
    },
    {
      key: "positiveMonthsRatio",
      label: "Cash-flow consistency",
      weight: 10,
      score: i.positiveMonthsRatio == null ? null : scale(i.positiveMonthsRatio, 30, 100),
      display: i.positiveMonthsRatio == null ? "—" : `${f1(i.positiveMonthsRatio)}% of months positive`,
      rule: "Share of the last 6 months where income exceeded expenses.",
    },
    {
      key: "diversification",
      label: "Investment diversification",
      weight: 10,
      score:
        i.diversification == null
          ? null
          : Math.round(
              (scale(i.diversification.classes, 1, 4) + scale(i.diversification.largestPct, 90, 40)) / 2,
            ),
      display: i.diversification == null ? "—" : `${i.diversification.classes} classes, top ${f1(i.diversification.largestPct)}%`,
      rule: "Number of asset classes (4+ ideal) and concentration of the largest class (≤40% ideal).",
    },
    {
      key: "goalsOnTrackPct",
      label: "Goal progress",
      weight: 5,
      score: i.goalsOnTrackPct == null ? null : Math.round(i.goalsOnTrackPct),
      display: i.goalsOnTrackPct == null ? "—" : `${f1(i.goalsOnTrackPct)}% on track`,
      rule: "Share of active goals projected to finish by their target date.",
    },
  ];

  const components: HealthComponent[] = defs.map((d) => ({
    ...d,
    status: d.score == null ? "nodata" : d.score >= 70 ? "strong" : d.score >= 40 ? "fair" : "weak",
  }));
  const scored = components.filter((c) => c.score != null);
  const totalW = scored.reduce((s, c) => s + c.weight, 0);
  const score = totalW >= 40 ? Math.round(scored.reduce((s, c) => s + c.score! * c.weight, 0) / totalW) : null;
  const band =
    score == null ? "Insufficient data" : score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 45 ? "Fair" : "Needs attention";
  return {
    score,
    band,
    components,
    strengths: components.filter((c) => c.status === "strong").map((c) => `${c.label}: ${c.display}`),
    weaknesses: components.filter((c) => c.status === "weak").map((c) => `${c.label}: ${c.display}`),
  };
}

export function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return (Math.sqrt(variance) / mean) * 100;
}
