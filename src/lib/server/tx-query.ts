import "server-only";
import { db } from "./db";
import type { Ctx } from "./data";
import { accountName, categoryLabel } from "./data";
import { categorySubtree } from "../finance/ledger";
import { parseMoney } from "../finance/money";
import { resolveRange } from "../finance/dates";
import type { TxRec } from "../finance/types";
import { TX_TYPE_LABELS } from "../finance/types";

export interface TxFilters {
  q?: string;
  type?: string;
  account?: string;
  category?: string;
  tag?: string;
  min?: string;
  max?: string;
  range?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  method?: string;
  demo?: string;
}

export function readFilters(sp: Record<string, string | string[] | undefined>): TxFilters {
  const g = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) || undefined;
  };
  return {
    q: g("q"),
    type: g("type"),
    account: g("account"),
    category: g("category"),
    tag: g("tag"),
    min: g("min"),
    max: g("max"),
    range: g("range") ?? "all",
    from: g("from"),
    to: g("to"),
    sort: g("sort") ?? "date",
    dir: g("dir") ?? "desc",
    method: g("method"),
    demo: g("demo"),
  };
}

/** Filters/sorts the ledger in native currency (as recorded). */
export async function queryTransactions(ctx: Ctx, f: TxFilters): Promise<{ rows: TxRec[]; range: { from: string; to: string; preset: string } }> {
  const range = resolveRange(f.range ?? "all", ctx.today, { from: f.from, to: f.to, earliest: ctx.earliestDate, fyStartMonth: ctx.prefs.fyStartMonth });
  let rows = ctx.txsNative.filter((t) => t.date >= range.from && t.date <= range.to);
  if (f.type) {
    const types = f.type.split(",");
    rows = rows.filter((t) => types.includes(t.type));
  }
  if (f.account) rows = rows.filter((t) => t.accountId === f.account || t.toAccountId === f.account);
  if (f.category) {
    if (f.category === "none") rows = rows.filter((t) => !t.categoryId && ["EXPENSE", "INCOME", "REFUND"].includes(t.type));
    else {
      const ids = categorySubtree(f.category, ctx.categories);
      rows = rows.filter((t) => t.categoryId && ids.has(t.categoryId));
    }
  }
  if (f.method) rows = rows.filter((t) => t.paymentMethod === f.method);
  if (f.demo === "only") rows = rows.filter((t) => t.isDemo);
  if (f.demo === "hide") rows = rows.filter((t) => !t.isDemo);
  const min = f.min ? parseMoney(f.min) : null;
  const max = f.max ? parseMoney(f.max) : null;
  if (min != null) rows = rows.filter((t) => Math.abs(t.amount) >= min);
  if (max != null) rows = rows.filter((t) => Math.abs(t.amount) <= max);
  if (f.tag) {
    const tagged = await db.transactionTag.findMany({
      where: { tag: { userId: ctx.userId, name: f.tag.toLowerCase() } },
      select: { transactionId: true },
    });
    const ids = new Set(tagged.map((t) => t.transactionId));
    rows = rows.filter((t) => ids.has(t.id));
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    const amountQ = parseMoney(f.q);
    rows = rows.filter(
      (t) =>
        t.merchant?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        categoryLabel(ctx, t.categoryId).toLowerCase().includes(q) ||
        accountName(ctx, t.accountId).toLowerCase().includes(q) ||
        TX_TYPE_LABELS[t.type].toLowerCase().includes(q) ||
        (amountQ != null && Math.abs(t.amount) === Math.abs(amountQ)),
    );
  }
  const dir = f.dir === "asc" ? 1 : -1;
  const key = f.sort ?? "date";
  rows = [...rows].sort((a, b) => {
    let c = 0;
    if (key === "amount") c = Math.abs(a.amount) - Math.abs(b.amount);
    else if (key === "merchant") c = (a.merchant ?? a.description ?? "").localeCompare(b.merchant ?? b.description ?? "");
    else if (key === "category") c = categoryLabel(ctx, a.categoryId).localeCompare(categoryLabel(ctx, b.categoryId));
    else if (key === "account") c = accountName(ctx, a.accountId).localeCompare(accountName(ctx, b.accountId));
    else c = a.date.localeCompare(b.date);
    return c * dir || b.id.localeCompare(a.id);
  });
  return { rows, range };
}
