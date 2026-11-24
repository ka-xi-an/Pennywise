import "server-only";
import type { Ctx } from "./data";
import type { HoldingRec } from "../finance/investments";
import { formatDate } from "../format";
import { daysBetween } from "../finance/dates";

/** Human label for where a valuation came from — never implies live market data. */
export function priceLabel(ctx: Ctx, h: HoldingRec): { text: string; tone: "warn" | "neutral" | "info"; stale: boolean } {
  if (!h.priceDate || (h.valuationMode === "UNITS" ? !h.currentPrice : h.currentValue == null))
    return { text: "No price — valued at cost", tone: "warn", stale: true };
  const stale = daysBetween(h.priceDate, ctx.today) > 45;
  if (h.priceSource === "DEMO") return { text: `Demo price (fictional) · ${formatDate(h.priceDate, ctx.fmt)}`, tone: "warn", stale };
  if (h.priceSource === "MANUAL") return { text: `Manual · ${formatDate(h.priceDate, ctx.fmt)}`, tone: stale ? "warn" : "neutral", stale };
  return { text: `${h.priceSource} · ${formatDate(h.priceDate, ctx.fmt)}`, tone: "info", stale };
}

export function invOptions(ctx: Ctx) {
  return {
    holdings: ctx.holdings.filter((h) => h.status === "ACTIVE").map((h) => ({ id: h.id, name: h.name, valuationMode: h.valuationMode, accountId: h.accountId })),
    cashAccounts: ctx.accounts.filter((a) => a.status === "ACTIVE" && a.type !== "LOAN").map((a) => ({ id: a.id, name: a.name })),
    brokerAccounts: ctx.accounts.filter((a) => a.type === "INVESTMENT").map((a) => ({ id: a.id, name: a.name })),
    sym: ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency,
  };
}
