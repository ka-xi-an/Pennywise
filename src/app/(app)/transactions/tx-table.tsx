"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Receipt, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Badge, btnClass } from "@/components/ui/core";
import { Dialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { bulkTransactions } from "./actions";

interface Row {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  type: string;
  category: string;
  account: string;
  method: string;
  amountText: string;
  tone: "pos" | "neg" | "neutral";
  isDemo: boolean;
}

export function TxTable({
  rows,
  categories,
  methods,
  sort,
  dir,
  emptyHasFilters,
}: {
  rows: Row[];
  categories: { value: string; label: string; kind: string }[];
  methods: { value: string; label: string }[];
  sort: string;
  dir: string;
  emptyHasFilters: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const run = (op: string, value?: string) =>
    start(async () => {
      const r = await bulkTransactions({ ids: [...selected], op, value });
      if (r.ok) {
        toast.success(r.message ?? "Done");
        setSelected(new Set());
        setConfirmDelete(false);
        router.refresh();
      } else toast.error(r.message);
    });

  const sortLink = (key: string) => {
    const n = new URLSearchParams(sp.toString());
    n.set("sort", key);
    n.set("dir", sort === key && dir === "desc" ? "asc" : "desc");
    return `${pathname}?${n.toString()}`;
  };
  const SortTh = ({ k, label, align = "left" }: { k: string; label: string; align?: "left" | "right" }) => (
    <th scope="col" className={clsx("border-b border-line bg-surface-2/60 px-3 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted", align === "right" && "text-right")}>
      <Link href={sortLink(k)} className="inline-flex items-center gap-1 hover:text-fg" aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : undefined}>
        {label}
        {sort === k && (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    </th>
  );

  if (!rows.length)
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <Receipt className="size-5" />
        </div>
        <p className="text-[14px] font-semibold">{emptyHasFilters ? "No transactions match these filters" : "No transactions yet"}</p>
        <p className="mt-1 max-w-sm text-[13px] text-fg-2">
          {emptyHasFilters ? "Try widening the date range or clearing filters." : "Add your first transaction (shortcut: N) or import a bank statement CSV."}
        </p>
      </div>
    );

  return (
    <>
      {selected.size > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2 text-[12.5px]">
          <span className="font-medium">{selected.size} selected</span>
          <select
            aria-label="Set category"
            className={btnClass("secondary", "sm", "pr-7")}
            value=""
            onChange={(e) => e.target.value && run("category", e.target.value === "__none" ? "" : e.target.value)}
            disabled={pending}
          >
            <option value="">Categorize…</option>
            <option value="__none">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.kind === "INCOME" ? "↑ " : ""}
                {c.label}
              </option>
            ))}
          </select>
          <select aria-label="Set payment method" className={btnClass("secondary", "sm", "pr-7")} value="" onChange={(e) => e.target.value && run("paymentMethod", e.target.value)} disabled={pending}>
            <option value="">Payment method…</option>
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = new FormData(e.currentTarget).get("tag") as string;
              if (v) run("tag", v);
            }}
          >
            <input name="tag" placeholder="Add tag" className="h-8 w-28 rounded-lg border border-line bg-surface px-2 text-[12.5px]" aria-label="Tag to add" />
            <button className={btnClass("secondary", "sm")} disabled={pending}>
              Tag
            </button>
          </form>
          <button className={btnClass("ghost", "sm", "text-neg")} onClick={() => setConfirmDelete(true)} disabled={pending}>
            <Trash2 className="size-3.5" /> Delete
          </button>
          <button className={btnClass("ghost", "sm", "ml-auto")} onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          {pending && <Loader2 className="size-4 animate-spin" />}
        </div>
      )}
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr>
              <th scope="col" className="w-10 border-b border-line bg-surface-2/60 py-2 pl-5">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  className="size-4 accent-[var(--accent)]"
                  checked={all}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              <SortTh k="date" label="Date" />
              <SortTh k="merchant" label="Description" />
              <SortTh k="category" label="Category" />
              <SortTh k="account" label="Account" />
              <SortTh k="amount" label="Amount" align="right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={clsx("group hover:bg-surface-2/50", selected.has(r.id) && "bg-accent-soft/50")}>
                <td className="border-b border-line py-2.5 pl-5">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.title}`}
                    className="size-4 accent-[var(--accent)]"
                    checked={selected.has(r.id)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="num whitespace-nowrap border-b border-line px-3 py-2.5 text-fg-2">{r.date}</td>
                <td className="max-w-[320px] border-b border-line px-3 py-2.5">
                  <Link href={`/transactions/${r.id}`} className="block truncate font-medium text-fg hover:underline">
                    {r.title}
                  </Link>
                  <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                    <span>{r.type}</span>
                    {r.method && <span>· {r.method}</span>}
                    {r.subtitle && <span className="truncate">· {r.subtitle}</span>}
                    {r.isDemo && <Badge tone="warn">Demo</Badge>}
                  </span>
                </td>
                <td className="max-w-[200px] truncate border-b border-line px-3 py-2.5 text-fg-2">{r.category}</td>
                <td className="max-w-[200px] truncate border-b border-line px-3 py-2.5 text-fg-2">{r.account}</td>
                <td className={clsx("num whitespace-nowrap border-b border-line px-3 py-2.5 pr-5 text-right font-medium", r.tone === "pos" ? "text-pos" : r.tone === "neutral" ? "text-fg-2" : "text-fg")}>
                  {r.amountText}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${selected.size} transaction${selected.size === 1 ? "" : "s"}?`}
        size="sm"
        footer={
          <>
            <button className={btnClass("ghost")} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className={btnClass("danger")} onClick={() => run("delete")} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} Delete
            </button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">
          Account balances, budgets, reports and net worth will be recalculated. Linked investment entries and paid-bill records are removed too. This cannot be undone.
        </p>
      </Dialog>
    </>
  );
}
