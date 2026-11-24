import clsx from "clsx";
import type { Cell, Report } from "@/lib/server/reports";
import { formatMoney, formatPct, formatNumber, type FormatPrefs } from "@/lib/format";
import { Card } from "./ui/core";

export function renderCell(c: Cell, prefs: FormatPrefs) {
  if (typeof c === "string") return c;
  if ("money" in c) return formatMoney(c.money, prefs);
  if ("pct" in c) return formatPct(c.pct);
  return formatNumber(c.num, prefs);
}

export function ReportView({ report, prefs }: { report: Report; prefs: FormatPrefs }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-6 py-5">
        <h2 className="text-[18px] font-semibold tracking-tight">{report.title}</h2>
        <p className="text-[12.5px] text-muted">{report.subtitle}</p>
      </div>
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr>
              {report.columns.map((c, i) => (
                <th key={i} className={clsx("border-b border-line bg-surface-2/60 px-4 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted first:pl-6 last:pr-6", i ? "text-right" : "text-left")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.sections.map((s, si) => (
              <SectionRows key={si} section={s} cols={report.columns.length} prefs={prefs} />
            ))}
          </tbody>
        </table>
      </div>
      {report.notes.length > 0 && (
        <ul className="space-y-1 border-t border-line px-6 py-4 text-[11.5px] text-muted">
          {report.notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SectionRows({ section, cols, prefs }: { section: Report["sections"][number]; cols: number; prefs: FormatPrefs }) {
  const neg = (c: Cell) => typeof c === "object" && "money" in c && c.money < 0;
  return (
    <>
      {section.title && (
        <tr>
          <td colSpan={cols} className="px-6 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wide text-fg-2">
            {section.title}
          </td>
        </tr>
      )}
      {section.rows.map((r, i) => (
        <tr key={i} className="hover:bg-surface-2/40">
          {r.map((c, j) => (
            <td key={j} className={clsx("px-4 py-1.5 first:pl-8 last:pr-6", j ? "num text-right" : "text-fg-2", neg(c) && "text-neg")}>
              {renderCell(c, prefs)}
            </td>
          ))}
        </tr>
      ))}
      {section.total && (
        <tr className="font-semibold">
          {section.total.map((c, j) => (
            <td key={j} className={clsx("border-t border-line px-4 py-2 first:pl-6 last:pr-6", j ? "num text-right" : "", neg(c) && "text-neg")}>
              {renderCell(c, prefs)}
            </td>
          ))}
        </tr>
      )}
    </>
  );
}
