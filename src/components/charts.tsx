"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { formatDate, formatMoney, formatPct, type FormatPrefs } from "@/lib/format";
import { monthLabel } from "@/lib/finance/dates";

/** Validated categorical palette (see dataviz validation): fixed order, never cycled. */
const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const OTHER_COLOR = { light: "#a3a9b5", dark: "#5b6475" };

export function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const mo = new MutationObserver(update);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

export function useSeriesColors() {
  const dark = useDark();
  return { colors: dark ? DARK : LIGHT, other: dark ? OTHER_COLOR.dark : OTHER_COLOR.light, dark };
}

export function seriesColor(slot: number, dark: boolean) {
  return (dark ? DARK : LIGHT)[slot % 8];
}

interface TableSpec {
  columns: string[];
  rows: (string | number)[][];
}

/** Chart container with title and a table-view toggle (accessibility & exact values). */
export function ChartFrame({
  title,
  subtitle,
  table,
  action,
  children,
  className,
  legend,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  table?: TableSpec;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  legend?: { label: string; slot?: number; color?: string; dashed?: boolean }[];
}) {
  const [showTable, setShowTable] = useState(false);
  const { colors } = useSeriesColors();
  return (
    <section className={clsx("print-card rounded-xl border border-line bg-surface shadow-card", className)}>
      {(title || table || action) && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-[13.5px] font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
          </div>
          <div className="no-print flex items-center gap-1.5">
            {action}
            {table && (
              <button
                type="button"
                onClick={() => setShowTable((s) => !s)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
                aria-label={showTable ? "Show chart" : "Show data table"}
                title={showTable ? "Show chart" : "Show data table"}
              >
                {showTable ? <BarChart3 className="size-4" /> : <Table2 className="size-4" />}
              </button>
            )}
          </div>
        </div>
      )}
      {legend && legend.length > 1 && !showTable && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-2 text-[12px] text-fg-2">
          {legend.map((l, i) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              {l.dashed ? (
                <span className="inline-block h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: l.color ?? colors[(l.slot ?? i) % 8] }} />
              ) : (
                <span className="inline-block h-2 w-3.5 rounded-sm" style={{ background: l.color ?? colors[(l.slot ?? i) % 8] }} />
              )}
              {l.label}
            </span>
          ))}
        </div>
      )}
      <div className="px-3 pb-3 pt-2">
        {showTable && table ? (
          <div className="thin-scroll max-h-80 overflow-auto px-2">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} className={clsx("border-b border-line py-1.5 font-medium text-muted", i ? "text-right" : "text-left")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((v, j) => (
                      <td key={j} className={clsx("num border-b border-line py-1.5", j ? "text-right" : "text-left")}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function TooltipBox({
  label,
  items,
}: {
  label?: ReactNode;
  items: { name: string; value: string; color: string; dashed?: boolean }[];
}) {
  return (
    <div className="min-w-[160px] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
      {label && <div className="mb-1 font-medium text-fg">{label}</div>}
      {items.map((it) => (
        <div key={it.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-fg-2">
            <span className="inline-block size-2 rounded-full" style={{ background: it.color }} />
            {it.name}
          </span>
          <span className="num font-medium text-fg">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export interface SeriesDef {
  key: string;
  name: string;
  slot?: number; // categorical slot
  color?: string;
  type?: "area" | "line" | "bar";
  dashed?: boolean; // projections / estimates
}

type Row = Record<string, string | number | null>;

/** Serializable x-axis formats (functions can't cross the server→client boundary). */
export type XFormat = "month" | "day" | "date" | "year" | "age";
function xFormatterFor(k: XFormat | undefined, prefs: FormatPrefs): ((v: string) => string) | undefined {
  switch (k) {
    case "month":
      return (v) => monthLabel(String(v).slice(0, 7));
    case "day":
      return (v) => String(v).slice(8, 10);
    case "date":
      return (v) => formatDate(String(v), prefs);
    case "year":
      return (v) => String(v).slice(0, 4);
    case "age":
      return (v) => `Age ${v}`;
    default:
      return undefined;
  }
}

const axisProps = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11 },
} as const;

function moneyTick(prefs: FormatPrefs) {
  return (v: number) => formatMoney(v, prefs, { compact: true, decimals: false });
}

/** Time-series area/line chart (net worth, balances, cash projections). */
export function TrendChart({
  data,
  xKey,
  series,
  prefs,
  height = 240,
  xFormat,
  zeroLine = false,
  valueFormat = "money",
}: {
  data: Row[];
  xKey: string;
  series: SeriesDef[];
  prefs: FormatPrefs;
  height?: number;
  xFormat?: XFormat;
  zeroLine?: boolean;
  valueFormat?: "money" | "percent";
}) {
  const { colors } = useSeriesColors();
  const xFormatter = xFormatterFor(xFormat, prefs);
  const col = (s: SeriesDef, i: number) => s.color ?? colors[(s.slot ?? i) % 8];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={col(s, i)} stopOpacity={0.14} />
                <stop offset="100%" stopColor={col(s, i)} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} minTickGap={24} />
          <YAxis {...axisProps} tickFormatter={valueFormat === "percent" ? (v: number) => `${v}%` : moneyTick(prefs)} width={64} />
          {zeroLine && <ReferenceLine y={0} stroke="var(--line-strong)" />}
          <Tooltip
            cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  label={xFormatter ? xFormatter(String(label)) : label}
                  items={payload
                    .filter((p) => p.value != null)
                    .map((p) => {
                      const i = series.findIndex((s) => s.key === p.dataKey);
                      return { name: series[i]?.name ?? String(p.name), value: valueFormat === "percent" ? formatPct(Number(p.value)) : formatMoney(Number(p.value), prefs), color: col(series[i], i) };
                    })}
                />
              ) : null
            }
          />
          {series.map((s, i) =>
            s.type === "line" || s.dashed ? (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={col(s, i)}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                connectNulls
                isAnimationActive={false}
              />
            ) : s.type === "bar" ? (
              <Bar key={s.key} dataKey={s.key} fill={col(s, i)} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            ) : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={col(s, i)}
                strokeWidth={2}
                fill={`url(#g-${s.key})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                connectNulls
                isAnimationActive={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Grouped column chart (income vs expenses, monthly spending). Negative values grow down from 0. */
export function ColumnChart({
  data,
  xKey,
  series,
  prefs,
  height = 240,
  xFormat,
  stacked = false,
}: {
  data: Row[];
  xKey: string;
  series: SeriesDef[];
  prefs: FormatPrefs;
  height?: number;
  xFormat?: XFormat;
  stacked?: boolean;
}) {
  const { colors } = useSeriesColors();
  const xFormatter = xFormatterFor(xFormat, prefs);
  const col = (s: SeriesDef, i: number) => s.color ?? colors[(s.slot ?? i) % 8];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }} barGap={2} barCategoryGap="24%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={xFormatter} minTickGap={8} />
          <YAxis {...axisProps} tickFormatter={moneyTick(prefs)} width={64} />
          <ReferenceLine y={0} stroke="var(--line-strong)" />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TooltipBox
                  label={xFormatter ? xFormatter(String(label)) : label}
                  items={payload.map((p) => {
                    const i = series.findIndex((s) => s.key === p.dataKey);
                    return { name: series[i]?.name ?? String(p.name), value: formatMoney(Number(p.value), prefs), color: col(series[i], i) };
                  })}
                />
              ) : null
            }
          />
          {series.map((s, i) =>
            s.type === "line" ? null : (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId={stacked ? "s" : undefined}
                fill={col(s, i)}
                radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : [4, 4, 0, 0]}
                maxBarSize={24}
                stroke={stacked ? "var(--surface)" : undefined}
                strokeWidth={stacked ? 2 : 0}
                isAnimationActive={false}
              />
            ),
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal ranked bars (category / merchant breakdowns) — label + value always visible. */
export function RankedBars({
  rows,
  prefs,
  max,
  showPct = true,
}: {
  rows: { key: string; label: string; value: number; color?: string; sub?: string; href?: string }[];
  prefs: FormatPrefs;
  max?: number;
  showPct?: boolean;
}) {
  const { colors } = useSeriesColors();
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  const top = max ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="flex min-w-0 items-center gap-2 text-fg">
              <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: r.color ?? colors[i % 8] }} />
              {r.href ? (
                <a href={r.href} className="truncate hover:underline">
                  {r.label}
                </a>
              ) : (
                <span className="truncate">{r.label}</span>
              )}
              {r.sub && <span className="shrink-0 text-muted">{r.sub}</span>}
            </span>
            <span className="num shrink-0 font-medium text-fg">
              {formatMoney(r.value, prefs)}
              {showPct && total > 0 && <span className="ml-1.5 font-normal text-muted">{formatPct((r.value / total) * 100, 0)}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(1, (Math.max(0, r.value) / top) * 100)}%`, background: r.color ?? colors[i % 8] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Donut for part-to-whole (asset allocation). Folds beyond 7 slices into "Other". */
export function Donut({
  rows,
  prefs,
  height = 200,
  centerLabel,
  centerValue,
}: {
  rows: { key: string; label: string; value: number; slot?: number }[];
  prefs: FormatPrefs;
  height?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { colors, other } = useSeriesColors();
  const sorted = [...rows].filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.slice(0, 7).map((r, i) => ({ ...r, color: colors[(r.slot ?? i) % 8] }));
  const rest = sorted.slice(7).reduce((s, r) => s + r.value, 0);
  if (rest > 0) shown.push({ key: "other", label: "Other", value: rest, color: other });
  const total = shown.reduce((s, r) => s + r.value, 0);
  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-4 @md:flex-row">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={shown.length > 1 ? 1.5 : 0}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {shown.map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    items={[
                      {
                        name: String(payload[0].name),
                        value: `${formatMoney(Number(payload[0].value), prefs)} · ${formatPct((Number(payload[0].value) / total) * 100)}`,
                        color: (payload[0].payload as { color: string }).color,
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        {centerValue && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] text-muted">{centerLabel}</span>
            <span className="text-[15px] font-semibold text-fg">{centerValue}</span>
          </div>
        )}
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {shown.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 text-[12.5px]">
            <span className="flex min-w-0 items-center gap-2 text-fg-2">
              <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="num shrink-0 text-fg">
              {formatPct(total ? (r.value / total) * 100 : 0)}
              <span className="ml-2 text-muted">{formatMoney(r.value, prefs, { compact: true })}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  );
}

/** Tiny sparkline for stat tiles (de-emphasised, no axes). */
export function Sparkline({ values, height = 32, positive = true }: { values: number[]; height?: number; positive?: boolean }) {
  const { colors } = useSeriesColors();
  if (values.length < 2) return null;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} className="w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Area type="monotone" dataKey="v" stroke={positive ? colors[0] : colors[1]} strokeWidth={1.5} fill="transparent" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
