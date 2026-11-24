/** Display formatting shared by server and client components. */
import { minorExponent } from "./finance/money";
import { formatDate as fmtDate } from "./finance/dates";

export interface FormatPrefs {
  currency: string;
  locale: string;
  dateFormat: string;
}

export const DEFAULT_PREFS: FormatPrefs = { currency: "INR", locale: "en-IN", dateFormat: "DD/MM/YYYY" };

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, opts: Intl.NumberFormatOptions) {
  const k = locale + JSON.stringify(opts);
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    nfCache.set(k, f);
  }
  return f;
}

export interface MoneyOpts {
  compact?: boolean;
  sign?: boolean; // always show +/−
  decimals?: boolean; // default true for full, false for compact
  currency?: string;
}

function symbolFor(currency: string, locale: string) {
  return (
    nf(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

export function formatMoney(minor: number | null | undefined, p: FormatPrefs = DEFAULT_PREFS, o: MoneyOpts = {}): string {
  if (minor == null || Number.isNaN(minor)) return "—";
  const currency = o.currency ?? p.currency;
  const exp = minorExponent(currency);
  const major = minor / 10 ** exp;
  const neg = major < 0;
  const abs = Math.abs(major);
  let body: string;
  if (o.compact && abs >= 1000) {
    const sym = symbolFor(currency, p.locale);
    if (p.locale.endsWith("-IN") || currency === "INR") {
      if (abs >= 1e7) body = `${sym}${trim(abs / 1e7)} Cr`;
      else if (abs >= 1e5) body = `${sym}${trim(abs / 1e5)} L`;
      else body = `${sym}${trim(abs / 1e3)}K`;
    } else {
      body = nf(p.locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 2 }).format(abs);
    }
  } else {
    const showDecimals = o.decimals ?? true;
    body = nf(p.locale, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: showDecimals ? exp : 0,
      maximumFractionDigits: showDecimals ? exp : 0,
    }).format(abs);
  }
  if (neg) return `−${body}`;
  if (o.sign && major > 0) return `+${body}`;
  return body;
}

function trim(n: number) {
  return n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1).replace(/\.0$/, "") : n.toFixed(2).replace(/\.?0+$/, "");
}

export function formatPct(v: number | null | undefined, digits = 1, sign = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = `${Math.abs(v).toFixed(digits)}%`;
  if (v < 0) return `−${s}`;
  return sign && v > 0 ? `+${s}` : s;
}

export function formatNumber(v: number | string | null | undefined, p: FormatPrefs = DEFAULT_PREFS, maxDigits = 4) {
  if (v == null || v === "") return "—";
  return nf(p.locale, { maximumFractionDigits: maxDigits }).format(Number(v));
}

export function formatDate(d: string | null | undefined, p: FormatPrefs = DEFAULT_PREFS) {
  return fmtDate(d, p.dateFormat);
}

/** Minor units → plain major string for form inputs ("1234.50"). */
export function minorToInput(minor: number | null | undefined, currency = "INR"): string {
  if (minor == null) return "";
  const exp = minorExponent(currency);
  return (minor / 10 ** exp).toFixed(exp);
}

export function maskAccountNumber(last4: string | null | undefined) {
  return last4 ? `•••• ${last4}` : "";
}
