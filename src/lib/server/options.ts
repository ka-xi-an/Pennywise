import "server-only";
import { cache } from "react";
import { db, n } from "./db";
import type { Ctx } from "./data";
import type { TxFormOptions } from "@/components/transaction-form";
import { minorToInput } from "../format";

function symbol(currency: string, locale: string) {
  try {
    return (
      new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((p) => p.type === "currency")
        ?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export const txFormOptions = cache(async (ctx: Ctx): Promise<TxFormOptions> => {
  const templates = await db.transactionTemplate.findMany({ where: { userId: ctx.userId }, orderBy: { name: "asc" } });
  return {
    accounts: ctx.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency, status: a.status })),
    categories: ctx.categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId })),
    holdings: ctx.holdings.filter((h) => h.status === "ACTIVE").map((h) => ({ id: h.id, name: h.name, valuationMode: h.valuationMode, accountId: h.accountId })),
    loans: ctx.loans.filter((l) => l.status === "ACTIVE").map((l) => ({ id: l.id, name: l.name, accountId: l.accountId })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      amount: t.amount != null ? minorToInput(n(t.amount), ctx.prefs.baseCurrency) : "",
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      categoryId: t.categoryId,
      merchant: t.merchant,
      paymentMethod: t.paymentMethod,
      description: t.description,
    })),
    today: ctx.today,
    currencySymbol: symbol(ctx.prefs.baseCurrency, ctx.prefs.locale),
  };
});
