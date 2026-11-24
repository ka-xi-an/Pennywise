import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { getCtx, categoryLabel, accountName } from "@/lib/server/data";
import { formatDate, formatMoney } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS } from "@/lib/finance/types";
import { ASSET_CLASS_LABELS } from "@/lib/finance/investments";
import { parseMoney } from "@/lib/finance/money";

/** Global search across the user's own records only. */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.json([], { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  if (q.length < 2) return NextResponse.json([]);
  const ctx = await getCtx(user.id);
  const amt = parseMoney(q);
  const out: { kind: string; label: string; sub?: string; href: string }[] = [];
  for (const a of ctx.accounts)
    if (a.name.toLowerCase().includes(q) || a.institution?.toLowerCase().includes(q))
      out.push({ kind: "Account", label: a.name, sub: ACCOUNT_TYPE_LABELS[a.type], href: `/accounts/${a.id}` });
  for (const h of ctx.holdings)
    if (h.name.toLowerCase().includes(q) || h.symbol?.toLowerCase().includes(q))
      out.push({ kind: "Holding", label: h.name, sub: ASSET_CLASS_LABELS[h.assetClass], href: `/investments/${h.id}` });
  for (const g of ctx.goals) if (g.name.toLowerCase().includes(q)) out.push({ kind: "Goal", label: g.name, href: "/goals" });
  for (const l of ctx.loans) if (l.name.toLowerCase().includes(q)) out.push({ kind: "Loan", label: l.name, href: `/wealth/loans/${l.id}` });
  for (const c of ctx.categories)
    if (c.name.toLowerCase().includes(q)) out.push({ kind: "Category", label: categoryLabel(ctx, c.id), href: `/transactions?category=${c.id}` });
  for (const r of ctx.rules) if (r.name.toLowerCase().includes(q)) out.push({ kind: "Recurring", label: r.name, href: "/recurring" });
  let n = 0;
  for (const t of ctx.txsNative) {
    if (n >= 12) break;
    if (
      t.merchant?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      (amt != null && Math.abs(t.amount) === Math.abs(amt))
    ) {
      out.push({
        kind: "Transaction",
        label: t.merchant || t.description || categoryLabel(ctx, t.categoryId),
        sub: `${formatDate(t.date, ctx.fmt)} · ${formatMoney(t.amount, { ...ctx.fmt, currency: t.currency })} · ${accountName(ctx, t.accountId)}`,
        href: `/transactions/${t.id}`,
      });
      n++;
    }
  }
  return NextResponse.json(out.slice(0, 30), { headers: { "Cache-Control": "no-store" } });
}
