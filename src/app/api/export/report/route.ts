import { NextResponse, type NextRequest } from "next/server";
import { apiUser } from "@/lib/server/auth";
import { getCtx } from "@/lib/server/data";
import { buildReport, customReport, type Cell } from "@/lib/server/reports";
import { resolveRange } from "@/lib/finance/dates";
import { toMajorString } from "@/lib/finance/money";
import { toCSV } from "@/lib/finance/csv";

/** CSV (Excel-compatible, UTF-8 BOM) export of any financial statement — same builder as the screen. */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await getCtx(user.id);
  const sp = req.nextUrl.searchParams;
  const id = sp.get("report") ?? "income-statement";
  const range = resolveRange(sp.get("range") ?? "this_fy", ctx.today, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, earliest: ctx.earliestDate, fyStartMonth: ctx.prefs.fyStartMonth });
  const report =
    id === "custom"
      ? customReport(ctx, range, { groupBy: sp.get("by") ?? "topCategory", measure: sp.get("measure") === "income" ? "income" : "expense", account: sp.get("account") ?? undefined, category: sp.get("category") ?? undefined })
      : await buildReport(ctx, id, range);
  const cell = (c: Cell) => (typeof c === "string" ? c : "money" in c ? toMajorString(c.money, ctx.prefs.baseCurrency) : "pct" in c ? (c.pct == null ? "" : c.pct.toFixed(2)) : c.num);
  const rows: unknown[][] = [[report.title], [report.subtitle], []];
  for (const s of report.sections) {
    if (s.title) rows.push([s.title]);
    for (const r of s.rows) rows.push(r.map(cell));
    if (s.total) rows.push(s.total.map(cell));
  }
  rows.push([], ...report.notes.map((n) => [n]), [`Amounts in ${ctx.prefs.baseCurrency}; percentages as numbers.`]);
  const csv = toCSV(report.columns, rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ledgerline-${report.id}-${ctx.today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
