"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import clsx from "clsx";
import { Card, btnClass } from "@/components/ui/core";
import { useToast } from "@/components/ui/toast";
import { parseMoney } from "@/lib/finance/money";
import { formatMoney, minorToInput } from "@/lib/format";
import { fiftyThirtyTwenty } from "@/lib/finance/budget";
import { saveBudget, type BudgetInput } from "./actions";

interface Cat {
  id: string;
  name: string;
  parentId: string | null;
  essential: boolean;
  average: number; // trailing 3-month average monthly spend
}

const METHODS = [
  { id: "CATEGORY", label: "Category budget", text: "Set a planned amount for the categories you want to control." },
  { id: "ZERO_BASED", label: "Zero-based", text: "Give every rupee of expected income a job until nothing is unassigned." },
  { id: "FIFTY_THIRTY_TWENTY", label: "50 / 30 / 20", text: "Needs 50%, wants 30%, savings & debt payoff 20% of income." },
  { id: "ENVELOPE", label: "Envelope", text: "Fixed envelopes per category; unspent money rolls into next period." },
] as const;

export function BudgetBuilder({
  categories,
  avgIncome,
  today,
  initial,
  currency,
  locale,
}: {
  categories: Cat[];
  avgIncome: number;
  today: string;
  currency: string;
  locale: string;
  initial?: BudgetInput & { id: string };
}) {
  const [name, setName] = useState(initial?.name ?? "Monthly budget");
  const [period, setPeriod] = useState<BudgetInput["period"]>(initial?.period ?? "MONTHLY");
  const [method, setMethod] = useState<BudgetInput["method"]>(initial?.method ?? "CATEGORY");
  const [startDate, setStartDate] = useState(initial?.startDate ?? today.slice(0, 8) + "01");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [rollover, setRollover] = useState(initial?.rollover ?? false);
  const [income, setIncome] = useState(initial?.expectedIncome != null ? minorToInput(initial.expectedIncome) : avgIncome ? minorToInput(avgIncome) : "");
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.lines ?? []).map((l) => [l.categoryId, minorToInput(l.amount)])),
  );
  const [groups, setGroups] = useState<Record<string, string>>(() => {
    const g: Record<string, string> = {};
    for (const c of categories) g[c.id] = c.essential ? "NEEDS" : "WANTS";
    for (const l of initial?.lines ?? []) if (l.group) g[l.categoryId] = l.group;
    return g;
  });
  const [limits, setLimits] = useState<Set<string>>(new Set((initial?.lines ?? []).filter((l) => l.isLimit).map((l) => l.categoryId)));
  const [showSubs, setShowSubs] = useState((initial?.lines ?? []).some((l) => categories.find((c) => c.id === l.categoryId)?.parentId));
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const fmt = { currency, locale, dateFormat: "DD/MM/YYYY" };
  const scale = period === "WEEKLY" ? 12 / 52 : period === "ANNUAL" ? 12 : 1;

  const minor = (s: string | undefined) => (s ? parseMoney(s) ?? 0 : 0);
  const total = Object.values(amounts).reduce((s, v) => s + Math.max(0, minor(v)), 0);
  const incomeMinor = minor(income);
  const groupTotals = useMemo(() => {
    const t: Record<string, number> = { NEEDS: 0, WANTS: 0, SAVINGS: 0 };
    for (const [id, v] of Object.entries(amounts)) t[groups[id] ?? "WANTS"] += Math.max(0, minor(v));
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amounts, groups]);
  const targets = fiftyThirtyTwenty(incomeMinor);
  const visible = categories.filter((c) => showSubs || !c.parentId);

  const suggest = () => {
    const next: Record<string, string> = {};
    for (const c of visible) if (c.average > 0) next[c.id] = minorToInput(Math.ceil((c.average * scale) / 10000) * 10000);
    setAmounts(next);
    toast.info("Filled with your trailing 3-month average spend (rounded up to the nearest ₹100).");
  };

  const submit = () =>
    start(async () => {
      const r = await saveBudget({
        id: initial?.id ?? null,
        name,
        period,
        method,
        startDate,
        endDate: period === "CUSTOM" ? endDate : null,
        rollover: method === "ENVELOPE" ? true : rollover,
        expectedIncome: method === "ZERO_BASED" || method === "FIFTY_THIRTY_TWENTY" ? incomeMinor || null : null,
        lines: Object.entries(amounts)
          .map(([categoryId, v]) => ({ categoryId, amount: minor(v), group: method === "FIFTY_THIRTY_TWENTY" ? (groups[categoryId] as "NEEDS" | "WANTS" | "SAVINGS") : null, isLimit: limits.has(categoryId) }))
          .filter((l) => l.amount > 0),
      });
      if (r.ok) {
        toast.success(r.message ?? "Saved");
        router.push(r.redirect ?? "/budgets");
      } else toast.error(r.message);
    });

  const inp = "h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px]";
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-4">
        <Card className="p-5">
          <p className="mb-3 text-[13.5px] font-semibold">Budget method</p>
          <div className="space-y-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethod(m.id);
                  if (m.id === "ENVELOPE") setRollover(true);
                }}
                className={clsx("w-full rounded-lg border px-3 py-2.5 text-left transition-colors", method === m.id ? "border-fg bg-surface-2" : "border-line hover:bg-surface-2")}
                aria-pressed={method === m.id}
              >
                <p className="text-[13px] font-medium">{m.label}</p>
                <p className="mt-0.5 text-[12px] text-fg-2">{m.text}</p>
              </button>
            ))}
          </div>
        </Card>
        <Card className="space-y-3 p-5">
          <label className="block text-[12.5px] font-medium text-fg-2">
            Name
            <input className={clsx(inp, "mt-1")} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-[12.5px] font-medium text-fg-2">
            Period
            <select className={clsx(inp, "mt-1")} value={period} onChange={(e) => setPeriod(e.target.value as BudgetInput["period"])}>
              <option value="MONTHLY">Monthly</option>
              <option value="WEEKLY">Weekly</option>
              <option value="ANNUAL">Annual</option>
              <option value="CUSTOM">Custom dates</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[12.5px] font-medium text-fg-2">
              Starts
              <input type="date" className={clsx(inp, "mt-1")} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            {period === "CUSTOM" && (
              <label className="block text-[12.5px] font-medium text-fg-2">
                Ends
                <input type="date" className={clsx(inp, "mt-1")} value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            )}
          </div>
          {(method === "ZERO_BASED" || method === "FIFTY_THIRTY_TWENTY") && (
            <label className="block text-[12.5px] font-medium text-fg-2">
              Expected income per period
              <input className={clsx(inp, "num mt-1")} inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} />
              <span className="mt-1 block text-[11.5px] font-normal text-muted">Your recent average is {formatMoney(Math.round(avgIncome * scale), fmt)}.</span>
            </label>
          )}
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={method === "ENVELOPE" || rollover} disabled={method === "ENVELOPE"} onChange={(e) => setRollover(e.target.checked)} />
            Roll unspent / overspent amounts into the next period
          </label>
        </Card>
        <Card className="p-5">
          <p className="text-[12px] text-muted">Total planned</p>
          <p className="num text-[22px] font-semibold">{formatMoney(total, fmt)}</p>
          {method === "ZERO_BASED" && (
            <p className={clsx("mt-1 text-[13px] font-medium", incomeMinor - total === 0 ? "text-pos" : incomeMinor - total < 0 ? "text-neg" : "text-warn")}>
              {incomeMinor - total === 0 ? "Every rupee assigned ✓" : incomeMinor - total > 0 ? `${formatMoney(incomeMinor - total, fmt)} still to assign` : `Over-assigned by ${formatMoney(total - incomeMinor, fmt)}`}
            </p>
          )}
          {method === "FIFTY_THIRTY_TWENTY" && (
            <div className="mt-3 space-y-1.5 text-[12.5px]">
              {(["NEEDS", "WANTS", "SAVINGS"] as const).map((g) => (
                <div key={g} className="flex justify-between">
                  <span className="text-fg-2">{g === "NEEDS" ? "Needs (50%)" : g === "WANTS" ? "Wants (30%)" : "Savings (20%)"}</span>
                  <span className={clsx("num", groupTotals[g] > targets[g.toLowerCase() as "needs"] && "text-neg")}>
                    {formatMoney(groupTotals[g], fmt, { compact: true })} / {formatMoney(targets[g.toLowerCase() as "needs"], fmt, { compact: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button className={btnClass("primary", "md", "mt-4 w-full")} onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} {initial ? "Save budget" : "Create budget"}
          </button>
        </Card>
      </div>
      <Card className="lg:col-span-8">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <p className="text-[13.5px] font-semibold">Planned amounts per {period === "WEEKLY" ? "week" : period === "ANNUAL" ? "year" : period === "CUSTOM" ? "period" : "month"}</p>
          <label className="ml-auto flex items-center gap-2 text-[12.5px] text-fg-2">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} /> Subcategories
          </label>
          <button type="button" className={btnClass("secondary", "sm")} onClick={suggest}>
            <Wand2 className="size-3.5" /> Suggest from history
          </button>
        </div>
        <div className="thin-scroll max-h-[640px] overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-2 text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-2">Category</th>
                <th className="px-3 py-2 text-right">3-mo avg</th>
                {method === "FIFTY_THIRTY_TWENTY" && <th className="px-3 py-2">Group</th>}
                <th className="px-3 py-2">Planned</th>
                <th className="px-3 py-2 text-center">Hard limit</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="border-t border-line">
                  <td className={clsx("px-5 py-1.5", c.parentId && "pl-10 text-fg-2")}>{c.name}</td>
                  <td className="num px-3 py-1.5 text-right text-muted">{c.average ? formatMoney(Math.round(c.average * scale), fmt, { decimals: false }) : "—"}</td>
                  {method === "FIFTY_THIRTY_TWENTY" && (
                    <td className="px-3 py-1.5">
                      <select className="h-8 rounded-md border border-line bg-surface px-2 text-[12.5px]" value={groups[c.id]} onChange={(e) => setGroups((g) => ({ ...g, [c.id]: e.target.value }))} aria-label={`${c.name} group`}>
                        <option value="NEEDS">Needs</option>
                        <option value="WANTS">Wants</option>
                        <option value="SAVINGS">Savings/debt</option>
                      </select>
                    </td>
                  )}
                  <td className="px-3 py-1.5">
                    <input
                      className="num h-8 w-32 rounded-md border border-line bg-surface px-2 text-right text-[13px]"
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Planned for ${c.name}`}
                      value={amounts[c.id] ?? ""}
                      onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--accent)]"
                      aria-label={`Hard limit for ${c.name}`}
                      checked={limits.has(c.id)}
                      onChange={(e) => setLimits((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-2.5 text-[11.5px] text-muted">
          A parent category&apos;s budget covers its subcategories. Avoid budgeting both a parent and its child unless you want the child counted twice. Hard limits raise critical alerts when exceeded.
        </p>
      </Card>
    </div>
  );
}
