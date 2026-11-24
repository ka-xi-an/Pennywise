/**
 * Portfolio engine. Positions are rebuilt by replaying investment transactions in
 * date order using the AVERAGE COST method (as used for Indian mutual funds / shares
 * cost reporting in most trackers).
 *
 *  BUY / SIP        qty += q; cost += amount + fees
 *  SELL             cost of units sold = avgCost × q; realized += (amount − fees) − that cost
 *  DIVIDEND/INTEREST payouts tracked separately (cash returned, not cost reduction)
 *  BONUS            qty += q (or qty × ratio); cost unchanged → avg cost falls
 *  SPLIT / MERGER   qty ×= ratio (new units per old unit); cost unchanged
 *  FEES             standalone charges (e.g. demat AMC) reduce total return
 *  TAX_WITHHOLDING  tax deducted at source on payouts; reduces total return
 *
 * VALUE-mode holdings (FD, PPF, EPF, NPS, real estate…) have no units: contributions
 * add to cost; a withdrawal returns capital first and books gains only beyond cost.
 *
 * Valuation uses ONLY the stored price/value (manually entered or from a configured
 * provider). An unpriced holding is valued at cost and flagged — never guessed.
 */
import Decimal from "decimal.js";
import type { ISODate, Minor } from "./types";
import { minorExponent, valueOf } from "./money";
import { daysBetween, yearFraction } from "./dates";

export const ASSET_CLASSES = [
  "STOCK",
  "MUTUAL_FUND",
  "ETF",
  "INDEX_FUND",
  "BOND",
  "FIXED_DEPOSIT",
  "GOLD",
  "SILVER",
  "REAL_ESTATE",
  "PPF",
  "EPF",
  "NPS",
  "OTHER",
] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  STOCK: "Stocks",
  MUTUAL_FUND: "Mutual funds",
  ETF: "ETFs",
  INDEX_FUND: "Index funds",
  BOND: "Bonds",
  FIXED_DEPOSIT: "Fixed deposits",
  GOLD: "Gold",
  SILVER: "Silver",
  REAL_ESTATE: "Real estate (REIT/fractional)",
  PPF: "PPF",
  EPF: "EPF",
  NPS: "NPS",
  OTHER: "Other",
};
/** Asset classes that are naturally valued as a lump sum rather than units × price. */
export const VALUE_MODE_DEFAULT: AssetClass[] = ["FIXED_DEPOSIT", "PPF", "EPF", "NPS", "REAL_ESTATE"];
/** Equity-oriented classes (for capital-gains holding period rules). */
export const EQUITY_CLASSES: AssetClass[] = ["STOCK", "MUTUAL_FUND", "ETF", "INDEX_FUND"];

export const INV_TX_TYPES = [
  "BUY",
  "SIP",
  "SELL",
  "DIVIDEND",
  "INTEREST",
  "BONUS",
  "SPLIT",
  "MERGER",
  "FEES",
  "TAX_WITHHOLDING",
] as const;
export type InvTxType = (typeof INV_TX_TYPES)[number];

export interface HoldingRec {
  id: string;
  name: string;
  symbol: string | null;
  assetClass: AssetClass;
  valuationMode: "UNITS" | "VALUE";
  currency: string;
  currentPrice: string | null;
  currentValue: Minor | null;
  priceDate: ISODate | null;
  priceSource: string;
  maturityDate: ISODate | null;
  interestRate: string | null;
  accountId: string | null;
  status: string;
  isDemo: boolean;
}

export interface InvTxRec {
  id: string;
  holdingId: string;
  type: InvTxType;
  date: ISODate;
  quantity: string | null;
  price: string | null;
  amount: Minor;
  fees: Minor;
  ratio: string | null;
}

export interface CashFlowPoint {
  date: ISODate;
  amount: Minor; // negative = money invested, positive = money returned
}

export interface RealizedLot {
  date: ISODate;
  holdingId: string;
  quantity: string | null;
  proceeds: Minor;
  costBasis: Minor;
  gain: Minor;
  /** acquisition date of the earliest units still held at sale time (average-cost approximation) */
  firstAcquired: ISODate | null;
}

export interface Position {
  holding: HoldingRec;
  quantity: string;
  costBasis: Minor;
  avgCost: string | null;
  totalInvested: Minor;
  marketValue: Minor;
  priced: boolean;
  valuationDate: ISODate | null;
  unrealized: Minor;
  realized: Minor;
  dividends: Minor;
  fees: Minor;
  taxWithheld: Minor;
  totalReturn: Minor;
  absoluteReturnPct: number | null;
  xirr: number | null;
  cagr: number | null;
  firstDate: ISODate | null;
  cashFlows: CashFlowPoint[];
  realizedLots: RealizedLot[];
}

export function buildPosition(holding: HoldingRec, txs: InvTxRec[], today: ISODate): Position {
  const list = txs.filter((t) => t.holdingId === holding.id).sort((a, b) => a.date.localeCompare(b.date));
  let qty = new Decimal(0);
  let cost = 0;
  let invested = 0;
  let realized = 0;
  let dividends = 0;
  let fees = 0;
  let taxWithheld = 0;
  let firstDate: ISODate | null = null;
  let firstHeld: ISODate | null = null;
  const flows: CashFlowPoint[] = [];
  const lots: RealizedLot[] = [];
  const valueMode = holding.valuationMode === "VALUE";

  for (const t of list) {
    const q = t.quantity ? new Decimal(t.quantity) : new Decimal(0);
    switch (t.type) {
      case "BUY":
      case "SIP": {
        const outlay = t.amount + t.fees;
        if (!valueMode) qty = qty.plus(q);
        cost += outlay;
        invested += outlay;
        firstDate ??= t.date;
        if (cost > 0 && !firstHeld) firstHeld = t.date;
        flows.push({ date: t.date, amount: -outlay });
        break;
      }
      case "SELL": {
        const proceeds = t.amount - t.fees;
        let costSold: number;
        if (valueMode) {
          costSold = Math.min(cost, proceeds);
          if (proceeds >= cost) costSold = cost; // full withdrawal / maturity books the gain
        } else {
          if (qty.lte(0)) {
            costSold = 0;
          } else {
            const sellQ = Decimal.min(q, qty);
            costSold = new Decimal(cost).mul(sellQ).div(qty).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
            qty = qty.minus(sellQ);
          }
        }
        const gain = proceeds - costSold;
        realized += gain;
        lots.push({
          date: t.date,
          holdingId: holding.id,
          quantity: t.quantity,
          proceeds,
          costBasis: costSold,
          gain,
          firstAcquired: firstHeld,
        });
        cost -= costSold;
        if ((!valueMode && qty.lte(0)) || (valueMode && cost <= 0)) {
          cost = 0;
          firstHeld = null;
        }
        flows.push({ date: t.date, amount: proceeds });
        break;
      }
      case "DIVIDEND":
      case "INTEREST":
        dividends += t.amount - t.fees;
        flows.push({ date: t.date, amount: t.amount - t.fees });
        break;
      case "BONUS":
        if (t.quantity) qty = qty.plus(q);
        else if (t.ratio) qty = qty.plus(qty.mul(t.ratio));
        break;
      case "SPLIT":
      case "MERGER":
        if (t.ratio) qty = qty.mul(t.ratio);
        break;
      case "FEES":
        fees += t.amount;
        flows.push({ date: t.date, amount: -t.amount });
        break;
      case "TAX_WITHHOLDING":
        taxWithheld += t.amount;
        flows.push({ date: t.date, amount: -t.amount });
        break;
    }
  }

  let marketValue = cost;
  let priced = false;
  let valuationDate: ISODate | null = null;
  if (valueMode) {
    if (holding.currentValue != null) {
      marketValue = holding.currentValue;
      priced = true;
      valuationDate = holding.priceDate;
    }
  } else if (holding.currentPrice != null && holding.currentPrice !== "") {
    marketValue = valueOf(qty.toString(), holding.currentPrice, holding.currency);
    priced = true;
    valuationDate = holding.priceDate;
  }
  if (!valueMode && qty.lte(0)) marketValue = 0;

  const unrealized = marketValue - cost;
  const totalReturn = realized + unrealized + dividends - fees - taxWithheld;
  const terminalDate = valuationDate && valuationDate > (list.at(-1)?.date ?? "") ? valuationDate : today;
  const allFlows = marketValue > 0 ? [...flows, { date: terminalDate, amount: marketValue }] : flows;

  let cagr: number | null = null;
  if (firstDate && cost > 0 && marketValue > 0) {
    const yrs = yearFraction(firstDate, terminalDate);
    if (yrs >= 1 / 12) cagr = computeCAGR(cost, marketValue, yrs);
  }

  return {
    holding,
    quantity: qty.toString(),
    costBasis: cost,
    avgCost:
      !valueMode && qty.gt(0)
        ? new Decimal(cost).div(new Decimal(10).pow(minorExponent(holding.currency))).div(qty).toDecimalPlaces(4).toString()
        : null,
    totalInvested: invested,
    marketValue,
    priced,
    valuationDate,
    unrealized,
    realized,
    dividends,
    fees,
    taxWithheld,
    totalReturn,
    absoluteReturnPct: invested > 0 ? (totalReturn / invested) * 100 : null,
    xirr: priced || marketValue === 0 ? xirr(allFlows) : null,
    cagr: priced ? cagr : null,
    firstDate,
    cashFlows: flows,
    realizedLots: lots,
  };
}

export interface PortfolioSummary {
  positions: Position[];
  invested: Minor; // current cost basis of open positions
  marketValue: Minor;
  unrealized: Minor;
  realized: Minor;
  dividends: Minor;
  totalReturn: Minor;
  absoluteReturnPct: number | null;
  xirr: number | null;
  unpricedCount: number;
  allocation: { assetClass: AssetClass; value: Minor; pct: number }[];
}

export function buildPortfolio(holdings: HoldingRec[], txs: InvTxRec[], today: ISODate): PortfolioSummary {
  const positions = holdings.map((h) => buildPosition(h, txs, today));
  let invested = 0,
    marketValue = 0,
    unrealized = 0,
    realized = 0,
    dividends = 0,
    totalReturn = 0,
    lifetimeInvested = 0,
    unpricedCount = 0;
  const flows: CashFlowPoint[] = [];
  const byClass = new Map<AssetClass, Minor>();
  for (const p of positions) {
    invested += p.costBasis;
    marketValue += p.marketValue;
    unrealized += p.unrealized;
    realized += p.realized;
    dividends += p.dividends;
    totalReturn += p.totalReturn;
    lifetimeInvested += p.totalInvested;
    if (!p.priced && p.costBasis > 0) unpricedCount++;
    flows.push(...p.cashFlows);
    if (p.marketValue > 0) byClass.set(p.holding.assetClass, (byClass.get(p.holding.assetClass) ?? 0) + p.marketValue);
  }
  if (marketValue > 0) flows.push({ date: today, amount: marketValue });
  const allocation = [...byClass.entries()]
    .map(([assetClass, value]) => ({ assetClass, value, pct: marketValue ? (value / marketValue) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
  return {
    positions,
    invested,
    marketValue,
    unrealized,
    realized,
    dividends,
    totalReturn,
    absoluteReturnPct: lifetimeInvested > 0 ? (totalReturn / lifetimeInvested) * 100 : null,
    xirr: xirr(flows),
    unpricedCount,
    allocation,
  };
}

/** CAGR = (end / start)^(1/years) − 1, as a percentage. */
export function computeCAGR(start: number, end: number, years: number): number | null {
  if (start <= 0 || end <= 0 || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/**
 * XIRR — annualised internal rate of return for irregular dated cash flows
 * (Actual/365). Newton–Raphson with a bisection fallback. Returns a percentage,
 * or null when the flows have no sign change or no root is found.
 */
export function xirr(flows: CashFlowPoint[]): number | null {
  const cf = flows.filter((f) => f.amount !== 0).sort((a, b) => a.date.localeCompare(b.date));
  if (cf.length < 2) return null;
  if (!cf.some((f) => f.amount < 0) || !cf.some((f) => f.amount > 0)) return null;
  const t0 = cf[0].date;
  const ts = cf.map((f) => daysBetween(t0, f.date) / 365);
  if (ts[ts.length - 1] === 0) return null;
  const npv = (r: number) => cf.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, ts[i]), 0);
  const dnpv = (r: number) => cf.reduce((s, f, i) => s - (ts[i] * f.amount) / Math.pow(1 + r, ts[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-10) return next * 100;
    r = next;
  }
  // Bisection fallback
  let lo = -0.9999,
    hi = 10;
  let flo = npv(lo),
    fhi = npv(hi);
  if (Number.isNaN(flo) || Number.isNaN(fhi) || flo * fhi > 0) {
    hi = 1000;
    fhi = npv(hi);
    if (flo * fhi > 0) return null;
  }
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-12) return mid * 100;
    if (flo * fm < 0) {
      hi = mid;
      fhi = fm;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return ((lo + hi) / 2) * 100;
}

/** Rebalancing deltas toward target allocation percentages (which should sum to 100). */
export function rebalance(
  current: { assetClass: string; value: Minor }[],
  targets: Record<string, number>,
): { assetClass: string; current: Minor; currentPct: number; targetPct: number; target: Minor; delta: Minor }[] {
  const total = current.reduce((s, c) => s + c.value, 0);
  const classes = new Set([...current.map((c) => c.assetClass), ...Object.keys(targets)]);
  return [...classes]
    .map((assetClass) => {
      const cur = current.find((c) => c.assetClass === assetClass)?.value ?? 0;
      const targetPct = targets[assetClass] ?? 0;
      const target = Math.round((total * targetPct) / 100);
      return {
        assetClass,
        current: cur,
        currentPct: total ? (cur / total) * 100 : 0,
        targetPct,
        target,
        delta: target - cur,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Upcoming maturities within `days`. */
export function upcomingMaturities(holdings: HoldingRec[], today: ISODate, days = 60) {
  return holdings
    .filter((h) => h.maturityDate && h.status === "ACTIVE")
    .map((h) => ({ holding: h, daysLeft: daysBetween(today, h.maturityDate!) }))
    .filter((x) => x.daysLeft >= 0 && x.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
