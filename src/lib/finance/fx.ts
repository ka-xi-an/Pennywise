/**
 * Currency conversion using USER-ENTERED rates only (no fabricated market rates).
 * Lookup uses the most recent rate on or before the requested date; if the direct
 * pair is missing the inverse pair is tried. Missing rates return null so callers
 * can exclude the item and surface a warning instead of guessing.
 */
import Decimal from "decimal.js";
import type { ISODate, Minor } from "./types";
import { minorExponent } from "./money";

export interface FxRateRec {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  date: ISODate;
}

export interface Converter {
  base: string;
  convert(amount: Minor, currency: string, date: ISODate): Minor | null;
  rateFor(currency: string, date: ISODate): string | null;
}

export function makeConverter(base: string, rates: FxRateRec[]): Converter {
  const byPair = new Map<string, FxRateRec[]>();
  for (const r of rates) {
    const k = `${r.fromCurrency}>${r.toCurrency}`;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k)!.push(r);
  }
  for (const list of byPair.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  const latestOnOrBefore = (list: FxRateRec[] | undefined, date: ISODate) => {
    if (!list?.length) return null;
    let found: FxRateRec | null = null;
    for (const r of list) if (r.date <= date) found = r;
    // If every recorded rate is after the date, fall back to the earliest one.
    return found ?? list[0];
  };

  const rateFor = (currency: string, date: ISODate): string | null => {
    if (currency === base) return "1";
    const direct = latestOnOrBefore(byPair.get(`${currency}>${base}`), date);
    if (direct) return direct.rate;
    const inv = latestOnOrBefore(byPair.get(`${base}>${currency}`), date);
    if (inv && Number(inv.rate) !== 0) return new Decimal(1).div(inv.rate).toString();
    return null;
  };

  return {
    base,
    rateFor,
    convert(amount, currency, date) {
      if (currency === base) return amount;
      const rate = rateFor(currency, date);
      if (rate == null) return null;
      const fromExp = minorExponent(currency);
      const toExp = minorExponent(base);
      return new Decimal(amount)
        .mul(rate)
        .mul(new Decimal(10).pow(toExp - fromExp))
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
        .toNumber();
    },
  };
}
