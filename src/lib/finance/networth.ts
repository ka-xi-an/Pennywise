/**
 * Net worth = Total assets − Total liabilities.
 *
 * Sources (each value counted exactly once):
 *   • Account balances (cash, bank, wallets, brokerage CASH) — positive → asset,
 *     negative → liability (credit-card outstanding, loan principal, overdraft).
 *   • Investment holdings — market value (or cost when unpriced, flagged). Holdings
 *     are separate from the cash balance of the investment account that holds them,
 *     so the account and its holdings never double count.
 *   • Manual assets (property, vehicles, business equity…) — investments are NOT
 *     permitted here; they belong in holdings.
 *   • Manual liabilities not modelled as loan accounts.
 */
import type { AccountRec, ISODate, Minor } from "./types";
import type { Converter } from "./fx";
import type { Position } from "./investments";
import { isLiabilityAccount } from "./ledger";

export interface AssetLike {
  id: string;
  name: string;
  type: string;
  currency: string;
  currentValue: Minor;
}
export interface LiabilityLike {
  id: string;
  name: string;
  type: string;
  currency: string;
  outstanding: Minor;
}

export type NWGroup =
  | "CASH_BANK"
  | "INVESTMENT_CASH"
  | "INVESTMENTS"
  | "OTHER_ASSETS"
  | "CREDIT_CARDS"
  | "LOANS"
  | "OTHER_LIABILITIES";

export const NW_GROUP_LABELS: Record<NWGroup, string> = {
  CASH_BANK: "Cash & bank",
  INVESTMENT_CASH: "Brokerage cash",
  INVESTMENTS: "Investments",
  OTHER_ASSETS: "Other assets",
  CREDIT_CARDS: "Credit cards",
  LOANS: "Loans",
  OTHER_LIABILITIES: "Other liabilities",
};

export interface NWItem {
  source: "account" | "holding" | "asset" | "liability";
  id: string;
  name: string;
  group: NWGroup;
  subtype: string;
  value: Minor; // base currency, positive
  flag?: string;
}

export interface NetWorth {
  totalAssets: Minor;
  totalLiabilities: Minor;
  netWorth: Minor;
  assets: NWItem[];
  liabilities: NWItem[];
  byGroup: Record<NWGroup, Minor>;
  debtToAsset: number | null;
  liquidAssets: Minor;
  warnings: string[];
}

export function computeNetWorth(input: {
  accounts: AccountRec[];
  balances: Map<string, Minor>;
  positions: Position[];
  assets: AssetLike[];
  liabilities: LiabilityLike[];
  fx: Converter;
  today: ISODate;
}): NetWorth {
  const { fx, today } = input;
  const assets: NWItem[] = [];
  const liabilities: NWItem[] = [];
  const warnings: string[] = [];
  const conv = (amount: Minor, currency: string, label: string) => {
    const v = fx.convert(amount, currency, today);
    if (v == null) warnings.push(`No ${currency}→${fx.base} exchange rate: "${label}" excluded from totals.`);
    return v;
  };

  for (const a of input.accounts) {
    if (!a.includeInNetWorth) continue;
    const native = input.balances.get(a.id) ?? 0;
    if (native === 0) continue;
    const v = conv(native, a.currency, a.name);
    if (v == null) continue;
    if (v > 0) {
      const group: NWGroup = a.type === "INVESTMENT" ? "INVESTMENT_CASH" : "CASH_BANK";
      assets.push({ source: "account", id: a.id, name: a.name, group, subtype: a.type, value: v });
    } else {
      const group: NWGroup = a.type === "LOAN" ? "LOANS" : a.type === "CREDIT_CARD" ? "CREDIT_CARDS" : "OTHER_LIABILITIES";
      liabilities.push({
        source: "account",
        id: a.id,
        name: a.name,
        group,
        subtype: isLiabilityAccount(a) ? a.type : "OVERDRAFT",
        value: -v,
      });
    }
  }

  for (const p of input.positions) {
    if (p.marketValue <= 0) continue;
    const v = conv(p.marketValue, p.holding.currency, p.holding.name);
    if (v == null) continue;
    assets.push({
      source: "holding",
      id: p.holding.id,
      name: p.holding.name,
      group: "INVESTMENTS",
      subtype: p.holding.assetClass,
      value: v,
      flag: p.priced ? undefined : "Valued at cost — no price entered",
    });
  }

  for (const a of input.assets) {
    const v = conv(a.currentValue, a.currency, a.name);
    if (v == null || v === 0) continue;
    assets.push({ source: "asset", id: a.id, name: a.name, group: "OTHER_ASSETS", subtype: a.type, value: v });
  }
  for (const l of input.liabilities) {
    const v = conv(l.outstanding, l.currency, l.name);
    if (v == null || v === 0) continue;
    liabilities.push({ source: "liability", id: l.id, name: l.name, group: "OTHER_LIABILITIES", subtype: l.type, value: v });
  }

  const byGroup = {
    CASH_BANK: 0,
    INVESTMENT_CASH: 0,
    INVESTMENTS: 0,
    OTHER_ASSETS: 0,
    CREDIT_CARDS: 0,
    LOANS: 0,
    OTHER_LIABILITIES: 0,
  } as Record<NWGroup, Minor>;
  for (const i of [...assets, ...liabilities]) byGroup[i.group] += i.value;
  const totalAssets = assets.reduce((s, i) => s + i.value, 0);
  const totalLiabilities = liabilities.reduce((s, i) => s + i.value, 0);
  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    assets: assets.sort((a, b) => b.value - a.value),
    liabilities: liabilities.sort((a, b) => b.value - a.value),
    byGroup,
    debtToAsset: totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : null,
    liquidAssets: byGroup.CASH_BANK,
    warnings: [...new Set(warnings)],
  };
}

/** Investment-only asset types must not be added as manual assets (prevents double counting). */
export const MANUAL_ASSET_TYPES = [
  "REAL_ESTATE",
  "VEHICLE",
  "BUSINESS_EQUITY",
  "RETIREMENT",
  "JEWELLERY",
  "COLLECTIBLE",
  "RECEIVABLE",
  "OTHER",
] as const;
export const MANUAL_ASSET_LABELS: Record<string, string> = {
  REAL_ESTATE: "Real estate",
  VEHICLE: "Vehicle",
  BUSINESS_EQUITY: "Business equity",
  RETIREMENT: "Retirement (other)",
  JEWELLERY: "Jewellery (non-investment)",
  COLLECTIBLE: "Collectibles",
  RECEIVABLE: "Money lent / receivable",
  OTHER: "Other asset",
};
export const MANUAL_LIABILITY_TYPES = ["PERSONAL_DEBT", "BUSINESS_LOAN", "TAX_PAYABLE", "OTHER"] as const;
export const MANUAL_LIABILITY_LABELS: Record<string, string> = {
  PERSONAL_DEBT: "Personal debt (friends/family)",
  BUSINESS_LOAN: "Business loan (untracked)",
  TAX_PAYABLE: "Tax payable",
  OTHER: "Other debt",
};
