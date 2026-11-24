import { Suspense } from "react";
import { Download } from "lucide-react";
import { pageCtx, param, rangeFrom, type SP } from "@/lib/server/page";
import { customReport } from "@/lib/server/reports";
import { categoryLabel } from "@/lib/server/data";
import { LinkButton, PageHeader } from "@/components/ui/core";
import { ParamSelect, RangePicker } from "@/components/range-picker";
import { ReportView } from "@/components/report-view";
import { PrintButton } from "@/components/print-button";
import { ChartFrame, ColumnChart, RankedBars } from "@/components/charts";

export const metadata = { title: "Custom report" };

export default async function CustomReportPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const { range } = rangeFrom(sp, ctx, "last_6_months");
  const groupBy = param(sp, "by") ?? "topCategory";
  const measure = param(sp, "measure") === "income" ? "income" : "expense";
  const account = param(sp, "account") ?? "";
  const category = param(sp, "category") ?? "";
  const report = customReport(ctx, range, { groupBy, measure, account: account || undefined, category: category || undefined });
  const rows = report.sections[0].rows.map((r) => ({ label: String(r[0]), value: (r[1] as { money: number }).money }));
  const timeSeries = ["month", "week", "day"].includes(groupBy);
  const qs = new URLSearchParams({ report: "custom", by: groupBy, measure, range: range.preset, ...(range.preset === "custom" ? { from: range.from, to: range.to } : {}), ...(account ? { account } : {}), ...(category ? { category } : {}) });
  return (
    <>
      <PageHeader
        title="Custom report"
        description="Slice spending or income any way you like. Everything responds to the filters."
        actions={
          <>
            <LinkButton href={`/api/export/report?${qs}`} prefetch={false}>
              <Download className="size-4" /> CSV / Excel
            </LinkButton>
            <PrintButton />
          </>
        }
      />
      <div className="no-print mb-4 flex flex-wrap gap-2">
        <Suspense>
          <ParamSelect name="measure" label="Measure" value={measure} options={[{ value: "expense", label: "Spending" }, { value: "income", label: "Income" }]} />
          <ParamSelect
            name="by"
            label="Group by"
            value={groupBy}
            options={[
              { value: "topCategory", label: "By category" },
              { value: "category", label: "By subcategory" },
              { value: "merchant", label: "By merchant" },
              { value: "paymentMethod", label: "By payment method" },
              { value: "account", label: "By account" },
              { value: "month", label: "By month" },
              { value: "week", label: "By week" },
              { value: "day", label: "By day" },
            ]}
          />
          <ParamSelect name="account" label="Account" value={account} options={[{ value: "", label: "All accounts" }, ...ctx.accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          <ParamSelect
            name="category"
            label="Category"
            value={category}
            options={[{ value: "", label: "All categories" }, ...ctx.categories.filter((c) => !c.parentId && c.kind === (measure === "income" ? "INCOME" : "EXPENSE")).map((c) => ({ value: c.id, label: categoryLabel(ctx, c.id) }))]}
          />
          <RangePicker value={range.preset} from={range.from} to={range.to} />
        </Suspense>
      </div>
      <div className="mb-4">
        {timeSeries ? (
          <ChartFrame title={report.title}>
            <ColumnChart prefs={ctx.fmt} xKey="x" data={rows.map((r) => ({ x: r.label, v: r.value }))} series={[{ key: "v", name: measure === "income" ? "Income" : "Spending", slot: measure === "income" ? 0 : 1 }]} height={240} />
          </ChartFrame>
        ) : (
          rows.length > 0 && (
            <ChartFrame title={report.title}>
              <div className="px-2 pb-2">
                <RankedBars prefs={ctx.fmt} rows={rows.slice(0, 12).map((r) => ({ key: r.label, label: r.label, value: r.value }))} />
              </div>
            </ChartFrame>
          )
        )}
      </div>
      <ReportView report={report} prefs={ctx.fmt} />
    </>
  );
}
