/**
 * Money primitives.
 *
 * Rounding policy: amounts are rounded to the currency's minor unit using
 * ROUND HALF AWAY FROM ZERO at the moment a value is *posted* (e.g. an EMI interest
 * component, quantity × price). Aggregations are exact integer sums of posted values.
 * Ratios/percentages are floating point and only used for display.
 */
import Decimal from "decimal.js";
import type { Minor } from "./types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Minor-unit exponent for a currency (INR/USD = 2, JPY = 0, BHD = 3). */
export function minorExponent(currency: string): number {
  try {
    const d = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits;
    return d ?? 2;
  } catch {
    return 2;
  }
}

export function assertSafe(n: number): Minor {
  if (!Number.isSafeInteger(n)) throw new Error(`Unsafe monetary value: ${n}`);
  return n;
}

/** Round a (possibly fractional) minor-unit number half away from zero. */
export function roundMinor(x: number): Minor {
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r === 0 ? 0 : r; // normalise -0
}

/** Parse a user-entered major-unit string ("1,23,456.78", "₹ 500", "-12.5") to minor units. */
export function parseMoney(input: string | number, currency = "INR"): Minor | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    input = String(input);
  }
  let s = input.trim().replace(/[₹$€£¥,\s]/g, "").replace(/^INR/i, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const exp = minorExponent(currency);
  const d = new Decimal(s).mul(new Decimal(10).pow(exp)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const v = d.toNumber() * (negative ? -1 : 1);
  if (!Number.isSafeInteger(v)) return null;
  return v === 0 ? 0 : v;
}

/** Minor units → major-unit decimal string ("123456.78"). */
export function toMajorString(minor: Minor, currency = "INR"): string {
  const exp = minorExponent(currency);
  return new Decimal(minor).div(new Decimal(10).pow(exp)).toFixed(exp);
}

export function toMajor(minor: Minor, currency = "INR"): number {
  return minor / 10 ** minorExponent(currency);
}

export function sum(values: Iterable<Minor>): Minor {
  let t = 0;
  for (const v of values) t += v;
  return assertSafe(t);
}

/** Safe percentage: returns null when the denominator is zero. */
export function pct(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 100;
}

/** Percentage change from previous to current; null when previous is 0. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** quantity × unit price (decimal strings) → minor units, rounded per policy. */
export function valueOf(quantity: string, price: string, currency = "INR"): Minor {
  const exp = minorExponent(currency);
  return new Decimal(quantity)
    .mul(new Decimal(price))
    .mul(new Decimal(10).pow(exp))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Multiply minor units by a decimal-string rate (FX, percentages) and round. */
export function mulRate(minor: Minor, rate: string | number): Minor {
  return new Decimal(minor).mul(new Decimal(rate)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Split an amount into n parts that sum exactly to the total (remainder spread to first parts). */
export function allocate(total: Minor, n: number): Minor[] {
  if (n <= 0) return [];
  const base = Math.trunc(total / n);
  let rem = total - base * n;
  const step = Math.sign(rem);
  return Array.from({ length: n }, () => {
    if (rem !== 0) {
      rem -= step;
      return base + step;
    }
    return base;
  });
}

export { Decimal };
