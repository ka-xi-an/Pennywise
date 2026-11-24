import { Suspense } from "react";
import { Download } from "lucide-react";
import { pageCtx, param, rangeFrom, type SP } from "@/lib/server/page";
import { buildReport, REPORTS } from "@/lib/server/reports";
import { LinkButton, PageHeader, cx } from "@/components/ui/core";
import { RangePicker } from "@/components/range-picker";
import { ReportView } from "@/components/report-view";
import { PrintButton } from "@/components/print-button";
import Link from "next/link";

export const metadata = { title: "Financial statements" };

export default async function ReportsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const id = param(sp, "report") ?? "income-statement";
  const { range } = rangeFrom(sp, ctx, id.startsWith("expense-annual") ? "this_year" : "this_fy");
  const report = await buildReport(ctx, id, range);
  const qs = new URLSearchParams({ report: id, range: range.preset, ...(range.preset === "custom" ? { from: range.from, to: range.to } : {}) });
  return (
    <>
      <PageHeader
        title="Financial statements"
        description="Every statement is generated from your stored transactions, accounts and holdings — they reconcile with each other."
        actions={
          <>
            {!report.asOf && (
              <Suspense>
                <RangePicker value={range.preset} from={range.from} to={range.to} />
              </Suspense>
            )}
            <LinkButton href={`/api/export/report?${qs}`} prefetch={false}>
              <Download className="size-4" /> CSV / Excel
            </LinkButton>
            <PrintButton />
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav className="no-print flex flex-row flex-wrap gap-1 lg:flex-col" aria-label="Reports">
          {REPORTS.map((r) => (
            <Link
              key={r.id}
              href={`/reports?report=${r.id}${range.preset !== "this_fy" ? `&range=${range.preset}` : ""}`}
              className={cx("rounded-lg px-3 py-2 text-[13px]", r.id === report.id ? "bg-surface font-medium text-fg shadow-card ring-1 ring-line" : "text-fg-2 hover:bg-surface-2")}
            >
              {r.label}
            </Link>
          ))}
          <Link href="/reports/custom" className="rounded-lg px-3 py-2 text-[13px] text-accent hover:bg-surface-2">
            + Custom report
          </Link>
        </nav>
        <ReportView report={report} prefs={ctx.fmt} />
      </div>
    </>
  );
}
