"use client";

import { useMemo, useState } from "react";
import { prepaymentScenario } from "@/lib/finance/loans";
import { parseMoney } from "@/lib/finance/money";
import { formatDate, formatMoney, type FormatPrefs } from "@/lib/format";
import { Card, CardHeader, btnClass } from "@/components/ui/core";

/** Early-repayment scenarios computed client-side with the same tested loan engine. */
export function PrepaymentSimulator({ outstanding, rate, emi, firstDate, prefs }: { outstanding: number; rate: number; emi: number; firstDate: string; prefs: FormatPrefs }) {
  const [lump, setLump] = useState("100000");
  const [extra, setExtra] = useState("0");
  const [mode, setMode] = useState<"REDUCE_TENURE" | "REDUCE_EMI">("REDUCE_TENURE");
  const r = useMemo(() => {
    const l = parseMoney(lump || "0") ?? 0;
    const x = parseMoney(extra || "0") ?? 0;
    return prepaymentScenario(outstanding, rate, emi, firstDate, Math.max(0, l), mode, Math.max(0, x));
  }, [lump, extra, mode, outstanding, rate, emi, firstDate]);
  const f = (v: number) => formatMoney(v, prefs);
  const inp = "num h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px]";
  return (
    <Card>
      <CardHeader title="Prepayment scenarios" subtitle="Estimate — assumes the current rate stays unchanged" />
      <div className="grid gap-3 px-5 sm:grid-cols-3">
        <label className="text-[12.5px] font-medium text-fg-2">
          Lump-sum prepayment now
          <input className={`${inp} mt-1`} inputMode="decimal" value={lump} onChange={(e) => setLump(e.target.value)} />
        </label>
        <label className="text-[12.5px] font-medium text-fg-2">
          Extra every month
          <input className={`${inp} mt-1`} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </label>
        <div className="text-[12.5px] font-medium text-fg-2">
          Bank option
          <div className="mt-1 flex gap-1">
            <button type="button" className={btnClass(mode === "REDUCE_TENURE" ? "primary" : "secondary", "sm", "flex-1")} onClick={() => setMode("REDUCE_TENURE")}>
              Reduce tenure
            </button>
            <button type="button" className={btnClass(mode === "REDUCE_EMI" ? "primary" : "secondary", "sm", "flex-1")} onClick={() => setMode("REDUCE_EMI")}>
              Reduce EMI
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
        <div className="rounded-lg bg-pos-soft p-3">
          <p className="text-[12px] text-fg-2">Interest saved</p>
          <p className="num text-[18px] font-semibold text-pos">{f(r.interestSaved)}</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="text-[12px] text-fg-2">{mode === "REDUCE_EMI" ? "New EMI" : "Months saved"}</p>
          <p className="num text-[18px] font-semibold">{mode === "REDUCE_EMI" ? f(r.newEmi ?? emi) : r.monthsSaved}</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="text-[12px] text-fg-2">Debt-free on</p>
          <p className="num text-[15px] font-semibold">{r.scenario.payoffDate ? formatDate(r.scenario.payoffDate, prefs) : "—"}</p>
          <p className="text-[11px] text-muted">was {r.baseline.payoffDate ? formatDate(r.baseline.payoffDate, prefs) : "—"}</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <p className="text-[12px] text-fg-2">Total interest</p>
          <p className="num text-[15px] font-semibold">{f(r.scenario.totalInterest)}</p>
          <p className="text-[11px] text-muted">was {f(r.baseline.totalInterest)}</p>
        </div>
      </div>
    </Card>
  );
}
