"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { RANGE_PRESETS } from "@/lib/finance/dates";
import { btnClass } from "./ui/core";

/** Date-range filter stored in the URL so every chart/report on the page responds to it. */
export function RangePicker({ value, from, to, exclude = [] }: { value: string; from: string; to: string; exclude?: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [custom, setCustom] = useState(value === "custom");
  const [cf, setCf] = useState(from);
  const [ct, setCt] = useState(to);
  const push = (params: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(params)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative">
        <span className="sr-only">Date range</span>
        <CalendarRange className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <select
          value={custom ? "custom" : value}
          onChange={(e) => {
            if (e.target.value === "custom") setCustom(true);
            else {
              setCustom(false);
              push({ range: e.target.value, from: null, to: null });
            }
          }}
          className={btnClass("secondary", "md", "pl-8 pr-8")}
        >
          {RANGE_PRESETS.filter((p) => !exclude.includes(p.id)).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {custom && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (cf && ct && cf <= ct) push({ range: "custom", from: cf, to: ct });
          }}
        >
          <input type="date" aria-label="From" value={cf} onChange={(e) => setCf(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-[12.5px]" />
          <span className="text-muted">→</span>
          <input type="date" aria-label="To" value={ct} onChange={(e) => setCt(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-[12.5px]" />
          <button className={btnClass("primary", "md")} disabled={!cf || !ct || cf > ct}>
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

/** Generic select that writes one URL search param. */
export function ParamSelect({
  name,
  value,
  options,
  label,
  className,
}: {
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <label className={className}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(sp.toString());
          if (e.target.value) next.set(name, e.target.value);
          else next.delete(name);
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className={btnClass("secondary", "md", "max-w-[220px] pr-8")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
