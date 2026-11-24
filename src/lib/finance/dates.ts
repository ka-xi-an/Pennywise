/**
 * Calendar-date utilities on ISO "YYYY-MM-DD" strings. All arithmetic is done in UTC
 * on pure dates so results never shift with the server or browser timezone.
 */
import type { DateRange, ISODate } from "./types";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function toUTC(d: ISODate): Date {
  return new Date(d + "T00:00:00Z");
}

export function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timeZone = "Asia/Kolkata", now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA formats as YYYY-MM-DD
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

/** Add months, clamping the day to the target month's length (31 Jan + 1M = 28/29 Feb). */
export function addMonths(d: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  const dim = daysInMonth(ny, nm + 1);
  const nd = Math.min(anchorDay ?? day, dim);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86400000);
}

export function startOfMonth(d: ISODate): ISODate {
  return d.slice(0, 8) + "01";
}

export function endOfMonth(d: ISODate): ISODate {
  const [y, m] = d.split("-").map(Number);
  return `${d.slice(0, 8)}${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

/** Monday-based week start. */
export function startOfWeek(d: ISODate): ISODate {
  const dow = toUTC(d).getUTCDay(); // 0 Sun
  return addDays(d, -((dow + 6) % 7));
}

export function startOfYear(d: ISODate): ISODate {
  return d.slice(0, 4) + "-01-01";
}

/** Financial year containing date d, given the FY start month (4 = April). */
export function financialYear(d: ISODate, fyStartMonth = 4): { label: string; from: ISODate; to: ISODate } {
  const [y, m] = d.split("-").map(Number);
  const startYear = m >= fyStartMonth ? y : y - 1;
  const from = `${startYear}-${String(fyStartMonth).padStart(2, "0")}-01`;
  const to = addDays(addMonths(from, 12), -1);
  const label =
    fyStartMonth === 1 ? String(startYear) : `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { label, from, to };
}

export function fyFromLabel(label: string, fyStartMonth = 4): DateRange {
  const startYear = Number(label.slice(0, 4));
  const from = `${startYear}-${String(fyStartMonth).padStart(2, "0")}-01`;
  return { from, to: addDays(addMonths(from, 12), -1) };
}

/** List of "YYYY-MM" keys covering the range, inclusive. */
export function monthsInRange(r: DateRange): string[] {
  const out: string[] = [];
  let cur = startOfMonth(r.from);
  const end = startOfMonth(r.to);
  let guard = 0;
  while (cur <= end && guard++ < 1200) {
    out.push(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

export function inRange(d: ISODate, r: DateRange): boolean {
  return d >= r.from && d <= r.to;
}

export const RANGE_PRESETS = [
  { id: "this_week", label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "last_6_months", label: "Last 6 months" },
  { id: "this_year", label: "This year" },
  { id: "last_year", label: "Last year" },
  { id: "this_fy", label: "This financial year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom range" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["id"];

/** Resolve a preset to a concrete range. "Last N months" includes the current month. */
export function resolveRange(
  preset: string,
  today: ISODate,
  opts: { from?: string; to?: string; earliest?: ISODate; fyStartMonth?: number } = {},
): DateRange & { preset: RangePreset } {
  switch (preset) {
    case "this_week":
      return { preset, from: startOfWeek(today), to: addDays(startOfWeek(today), 6) };
    case "last_month": {
      const s = addMonths(startOfMonth(today), -1);
      return { preset, from: s, to: endOfMonth(s) };
    }
    case "last_3_months":
      return { preset, from: addMonths(startOfMonth(today), -2), to: endOfMonth(today) };
    case "last_6_months":
      return { preset, from: addMonths(startOfMonth(today), -5), to: endOfMonth(today) };
    case "this_year":
      return { preset, from: startOfYear(today), to: today.slice(0, 4) + "-12-31" };
    case "last_year": {
      const y = Number(today.slice(0, 4)) - 1;
      return { preset, from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "this_fy": {
      const fy = financialYear(today, opts.fyStartMonth ?? 4);
      return { preset, from: fy.from, to: fy.to };
    }
    case "all":
      return { preset, from: opts.earliest ?? "1970-01-01", to: endOfMonth(today) };
    case "custom":
      if (opts.from && opts.to && isISODate(opts.from) && isISODate(opts.to) && opts.from <= opts.to)
        return { preset, from: opts.from, to: opts.to };
      return { preset: "this_month", from: startOfMonth(today), to: endOfMonth(today) };
    case "this_month":
    default:
      return { preset: "this_month", from: startOfMonth(today), to: endOfMonth(today) };
  }
}

/** The immediately preceding range of equal length (used for period comparisons). */
export function previousRange(r: DateRange): DateRange {
  // Whole-month ranges compare against the same number of whole months.
  if (r.from === startOfMonth(r.from) && r.to === endOfMonth(r.to)) {
    const months = monthsInRange(r).length;
    const from = addMonths(r.from, -months);
    return { from, to: addDays(r.from, -1) };
  }
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

/** Year fraction between two dates (Actual/365), used by CAGR & XIRR. */
export function yearFraction(a: ISODate, b: ISODate): number {
  return daysBetween(a, b) / 365;
}

export function formatDate(d: ISODate | null | undefined, format = "DD/MM/YYYY"): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  switch (format) {
    case "MM/DD/YYYY":
      return `${m}/${day}/${y}`;
    case "YYYY-MM-DD":
      return d;
    case "DD MMM YYYY":
      return `${day} ${MONTHS_SHORT[Number(m) - 1]} ${y}`;
    default:
      return `${day}/${m}/${y}`;
  }
}

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS_SHORT[Number(m) - 1]} ${y.slice(2)}`;
}

/** Parse common user/import date formats into ISO. dayFirst resolves ambiguous dd/mm vs mm/dd. */
export function parseDateFlexible(input: string, dayFirst = true): ISODate | null {
  const s = input.trim();
  if (isISODate(s)) return s;
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (m) {
    let [, a, b, y] = m;
    if (y.length === 2) y = (Number(y) > 69 ? "19" : "20") + y;
    const [dd, mm] = dayFirst ? [a, b] : [b, a];
    const iso = `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    return isISODate(iso) ? iso : null;
  }
  m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{2,4})$/);
  if (m) {
    const mi = MONTHS_SHORT.findIndex((x) => x.toLowerCase() === m![2].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    let y = m[3];
    if (y.length === 2) y = "20" + y;
    const iso = `${y}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isISODate(iso) ? iso : null;
  }
  m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}
