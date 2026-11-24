"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { RangePicker } from "@/components/range-picker";
import { btnClass } from "@/components/ui/core";
import type { TxFilters } from "@/lib/server/tx-query";

type Opt = { value: string; label: string };

export function TxFilterBar({
  filters,
  range,
  accounts,
  categories,
  tags,
  methods,
}: {
  filters: TxFilters;
  range: { from: string; to: string; preset: string };
  accounts: Opt[];
  categories: (Opt & { kind: string })[];
  tags: string[];
  types: Opt[];
  methods: Opt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(filters.q ?? "");
  const [more, setMore] = useState(!!(filters.min || filters.max || filters.tag || filters.method));
  const set = (patch: Record<string, string | null>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    n.delete("page");
    router.push(`${pathname}?${n.toString()}`);
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q) set({ q: q || null });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sel = "h-9 max-w-[200px] rounded-lg border border-line bg-surface px-2.5 pr-8 text-[13px] text-fg shadow-card";
  const active = ["account", "category", "tag", "min", "max", "method", "q"].filter((k) => filters[k as keyof TxFilters]).length;
  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search merchant, description, category, amount…"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[13px] shadow-card outline-none focus:border-accent"
            aria-label="Search transactions"
          />
        </div>
        <RangePicker value={range.preset} from={range.from} to={range.to} />
        <select aria-label="Account" className={sel} value={filters.account ?? ""} onChange={(e) => set({ account: e.target.value || null })}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <select aria-label="Category" className={sel} value={filters.category ?? ""} onChange={(e) => set({ category: e.target.value || null })}>
          <option value="">All categories</option>
          <option value="none">Uncategorized</option>
          <optgroup label="Expense">
            {categories
              .filter((c) => c.kind === "EXPENSE")
              .map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
          </optgroup>
          <optgroup label="Income">
            {categories
              .filter((c) => c.kind === "INCOME")
              .map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
          </optgroup>
        </select>
        <button className={btnClass(more ? "secondary" : "ghost")} onClick={() => setMore((m) => !m)} aria-expanded={more}>
          <SlidersHorizontal className="size-4" /> More
        </button>
        {active > 0 && (
          <button
            className={btnClass("ghost")}
            onClick={() => {
              setQ("");
              router.push(pathname + (filters.type ? `?type=${filters.type}` : ""));
            }}
          >
            <X className="size-4" /> Clear ({active})
          </button>
        )}
      </div>
      {more && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2/60 p-2">
          <input
            aria-label="Minimum amount"
            placeholder="Min amount"
            defaultValue={filters.min}
            inputMode="decimal"
            onBlur={(e) => set({ min: e.target.value || null })}
            className="h-9 w-32 rounded-lg border border-line bg-surface px-2.5 text-[13px]"
          />
          <input
            aria-label="Maximum amount"
            placeholder="Max amount"
            defaultValue={filters.max}
            inputMode="decimal"
            onBlur={(e) => set({ max: e.target.value || null })}
            className="h-9 w-32 rounded-lg border border-line bg-surface px-2.5 text-[13px]"
          />
          <select aria-label="Tag" className={sel} value={filters.tag ?? ""} onChange={(e) => set({ tag: e.target.value || null })}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select aria-label="Payment method" className={sel} value={filters.method ?? ""} onChange={(e) => set({ method: e.target.value || null })}>
            <option value="">Any payment method</option>
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select aria-label="Demo records" className={sel} value={filters.demo ?? ""} onChange={(e) => set({ demo: e.target.value || null })}>
            <option value="">Demo + own records</option>
            <option value="hide">Hide demo records</option>
            <option value="only">Demo records only</option>
          </select>
        </div>
      )}
    </div>
  );
}
