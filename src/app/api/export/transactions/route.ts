import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { getCtx, accountName, categoryLabel } from "@/lib/server/data";
import { queryTransactions, readFilters } from "@/lib/server/tx-query";
import { db } from "@/lib/server/db";
import { toCSV } from "@/lib/finance/csv";
import { toMajorString } from "@/lib/finance/money";
import { TX_TYPE_LABELS } from "@/lib/finance/types";
import { audit } from "@/lib/server/audit";

/** CSV export of the currently filtered transactions (UTF-8 BOM → opens cleanly in Excel). */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCtx(user.id);
  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const { rows } = await queryTransactions(ctx, readFilters(sp));
  const tags = await db.transactionTag.findMany({ where: { transactionId: { in: rows.map((r) => r.id) } }, include: { tag: true } });
  const tagMap = new Map<string, string[]>();
  for (const t of tags) tagMap.set(t.transactionId, [...(tagMap.get(t.transactionId) ?? []), t.tag.name]);
  const csv = toCSV(
    ["ID", "Date", "Type", "Amount", "Currency", "Account", "To account", "Category", "Merchant", "Payment method", "Description", "Principal", "Interest", "Tags", "Demo"],
    rows.map((t) => [
      t.id,
      t.date,
      TX_TYPE_LABELS[t.type],
      toMajorString(t.amount, t.currency),
      t.currency,
      accountName(ctx, t.accountId),
      t.toAccountId ? accountName(ctx, t.toAccountId) : "",
      t.categoryId ? categoryLabel(ctx, t.categoryId) : "",
      t.merchant ?? "",
      t.paymentMethod ?? "",
      t.description ?? "",
      t.principalAmount != null ? toMajorString(t.principalAmount, t.currency) : "",
      t.interestAmount != null ? toMajorString(t.interestAmount, t.currency) : "",
      (tagMap.get(t.id) ?? []).join("; "),
      t.isDemo ? "yes" : "",
    ]),
  );
  await audit(user.id, "export.transactions", "Transaction", null, { rows: rows.length });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledgerline-transactions-${ctx.today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
