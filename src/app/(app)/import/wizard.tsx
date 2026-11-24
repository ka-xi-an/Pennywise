"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FileUp, Loader2, Download, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { Badge, Card, btnClass } from "@/components/ui/core";
import { useToast } from "@/components/ui/toast";
import { parseCSV, toCSV } from "@/lib/finance/csv";
import { formatMoney } from "@/lib/format";
import type { ImportResult } from "@/lib/server/services/importer";
import { commitImport, previewImport, type ImportInput } from "./actions";

type Mapping = ImportInput["mapping"];

const GUESS: Record<keyof Mapping, RegExp> = {
  date: /^(txn |transaction |value |posting )?date$|^date/i,
  description: /narration|description|particulars|details|remarks/i,
  amount: /^amount|^amt|amount \(inr\)|^value$/i,
  debit: /debit|withdrawal|dr\b|paid out/i,
  credit: /credit|deposit|cr\b|paid in/i,
  merchant: /merchant|payee|beneficiary/i,
  category: /category/i,
  notes: /note|memo|reference|ref/i,
};

export function ImportWizard({ accounts }: { accounts: { id: string; name: string; currency: string }[] }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [mapping, setMapping] = useState<Mapping>({ date: "" });
  const [amountMode, setAmountMode] = useState<ImportInput["amountMode"]>("signed");
  const [dayFirst, setDayFirst] = useState(true);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [includeDup, setIncludeDup] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const headers = useMemo(() => (file ? (parseCSV(file.text.slice(0, 20000))[0] ?? []).map((h) => h.trim()) : []), [file]);
  const sampleRows = useMemo(() => (file ? parseCSV(file.text.slice(0, 20000)).slice(1, 4) : []), [file]);
  const account = accounts.find((a) => a.id === accountId);

  const onFile = async (f: File) => {
    if (f.size > 8_000_000) return toast.error("File too large (8 MB max). Split the statement.");
    const text = await f.text();
    const hs = (parseCSV(text.slice(0, 20000))[0] ?? []).map((h) => h.trim());
    const m: Mapping = { date: "" };
    for (const [k, re] of Object.entries(GUESS) as [keyof Mapping, RegExp][]) {
      const h = hs.find((x) => re.test(x) && !Object.values(m).includes(x));
      if (h) m[k] = h;
    }
    setMapping(m);
    setAmountMode(m.amount ? "signed" : m.debit || m.credit ? "debitCredit" : "signed");
    setFile({ name: f.name, text });
    setPreview(null);
    setDone(null);
    setSkip(new Set());
    setIncludeDup(new Set());
  };

  const input = (): ImportInput => ({
    filename: file!.name,
    accountId,
    text: file!.text,
    mapping,
    dayFirst,
    amountMode,
    skipRows: [...skip],
    includeDuplicates: [...includeDup],
  });

  const doPreview = () =>
    start(async () => {
      const r = await previewImport(input());
      if (r.ok && r.data) setPreview(r.data);
      else if (!r.ok) toast.error(r.message);
    });
  const doImport = () =>
    start(async () => {
      const r = await commitImport(input());
      if (r.ok && r.data) {
        setDone(r.data);
        setPreview(null);
        toast.success(r.message ?? "Imported");
      } else if (!r.ok) toast.error(r.message);
    });

  const downloadReport = (res: ImportResult) => {
    const csv = toCSV(
      ["Row", "Status", "Problems", ...res.headers],
      res.rows.map((r) => [r.index, r.status, r.errors.join("; "), ...r.raw]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-report-${file?.name ?? "file"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sel = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]";
  const fmt = { currency: account?.currency ?? "INR", locale: "en-IN", dateFormat: "DD/MM/YYYY" };

  if (done)
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 text-pos" />
          <div className="flex-1">
            <p className="text-[15px] font-semibold">
              Imported {done.imported} of {done.total} rows into {account?.name}
            </p>
            <p className="mt-1 text-[13px] text-fg-2">
              {done.duplicates} duplicate(s) and {done.skipped} excluded row(s) were not imported; {done.errors} row(s) had errors. Nothing was dropped silently — download the report for row-by-row outcomes.
            </p>
            <div className="mt-4 flex gap-2">
              <button className={btnClass("secondary")} onClick={() => downloadReport(done)}>
                <Download className="size-4" /> Download report
              </button>
              <Link className={btnClass("primary")} href={`/transactions?account=${accountId}`}>
                View transactions
              </Link>
              <button className={btnClass("ghost")} onClick={() => { setDone(null); setFile(null); }}>
                Import another file
              </button>
            </div>
          </div>
        </div>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_260px]">
          <label
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line-strong bg-surface-2/50 px-6 py-8 text-center hover:border-accent"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
          >
            <FileUp className="mb-2 size-6 text-muted" />
            <span className="text-[13.5px] font-medium">{file ? file.name : "Drop a CSV file here or click to choose"}</span>
            <span className="mt-1 text-[12px] text-muted">Comma, semicolon or tab separated · UTF-8 · up to 8 MB</span>
            <input type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <div className="space-y-3">
            <label className="block text-[12.5px] font-medium text-fg-2">
              Import into account
              <select className={clsx(sel, "mt-1")} value={accountId} onChange={(e) => { setAccountId(e.target.value); setPreview(null); }}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12.5px] font-medium text-fg-2">
              Date format in file
              <select className={clsx(sel, "mt-1")} value={dayFirst ? "dmy" : "mdy"} onChange={(e) => setDayFirst(e.target.value === "dmy")}>
                <option value="dmy">Day first (DD/MM/YYYY)</option>
                <option value="mdy">Month first (MM/DD/YYYY)</option>
              </select>
            </label>
            {accounts.length === 0 && <p className="text-[12.5px] text-neg">Create an account first.</p>}
          </div>
        </div>
      </Card>

      {file && (
        <Card className="p-5">
          <p className="mb-3 text-[13.5px] font-semibold">Map columns</p>
          <div className="mb-3 flex flex-wrap gap-2 text-[12.5px]">
            {(["signed", "debitCredit", "positiveExpense"] as const).map((m) => (
              <button key={m} className={btnClass(amountMode === m ? "primary" : "secondary", "sm")} onClick={() => setAmountMode(m)}>
                {m === "signed" ? "One amount column (− = spend)" : m === "debitCredit" ? "Separate debit & credit columns" : "All amounts are spending"}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["date", "Date *"],
                ["description", "Description / narration"],
                ...(amountMode === "debitCredit" ? [["debit", "Debit (withdrawal)"], ["credit", "Credit (deposit)"]] : [["amount", "Amount *"]]),
                ["merchant", "Merchant (optional)"],
                ["category", "Category (optional)"],
                ["notes", "Notes / reference (optional)"],
              ] as [keyof Mapping, string][]
            ).map(([k, label]) => (
              <label key={k} className="block text-[12.5px] font-medium text-fg-2">
                {label}
                <select className={clsx(sel, "mt-1")} value={mapping[k] ?? ""} onChange={(e) => { setMapping((m) => ({ ...m, [k]: e.target.value || undefined })); setPreview(null); }}>
                  <option value="">— not in file —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {sampleRows.length > 0 && (
            <div className="thin-scroll mt-4 overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-2">
                  <tr>{headers.map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium text-muted">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {sampleRows.map((r, i) => (
                    <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button className={btnClass("primary")} onClick={doPreview} disabled={pending || !mapping.date || !accountId}>
              {pending && <Loader2 className="size-4 animate-spin" />} Validate & preview
            </button>
          </div>
        </Card>
      )}

      {preview && (
        <Card>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
            <p className="text-[13.5px] font-semibold">Preview</p>
            <Badge tone="pos">{preview.ready} ready</Badge>
            <Badge tone="warn">{preview.duplicates} duplicates</Badge>
            <Badge tone="neg">{preview.errors} errors</Badge>
            <Badge>{preview.skipped} excluded</Badge>
            <span className="ml-auto flex gap-2">
              <button className={btnClass("secondary", "sm")} onClick={() => downloadReport(preview)}>
                <Download className="size-3.5" /> Report
              </button>
              <button className={btnClass("secondary", "sm")} onClick={doPreview} disabled={pending}>
                Re-validate
              </button>
              <button className={btnClass("primary", "sm")} onClick={doImport} disabled={pending || preview.ready === 0}>
                {pending && <Loader2 className="size-3.5 animate-spin" />} Import {preview.ready} rows
              </button>
            </span>
          </div>
          <div className="thin-scroll max-h-[520px] overflow-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead className="sticky top-0 bg-surface-2">
                <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2">Include</th>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const included = r.status === "ready" || (r.status === "duplicate" && includeDup.has(r.index));
                  return (
                    <tr key={r.index} className={clsx("border-t border-line", r.status === "error" && "bg-neg-soft/40", r.status === "duplicate" && "bg-warn-soft/40")}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--accent)]"
                          disabled={r.status === "error"}
                          checked={r.status === "skipped" ? false : included}
                          aria-label={`Include row ${r.index}`}
                          onChange={(e) => {
                            setPreview(null);
                            if (r.status === "duplicate") setIncludeDup((s) => { const n = new Set(s); if (e.target.checked) n.add(r.index); else n.delete(r.index); return n; });
                            else setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.index); else n.add(r.index); return n; });
                          }}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-muted">{r.index}</td>
                      <td className="num px-3 py-1.5">{r.date ?? "—"}</td>
                      <td className="max-w-[280px] px-3 py-1.5">
                        <span className="block truncate">{r.merchant ?? r.description ?? "—"}</span>
                        {r.paymentMethod && <span className="text-[11px] text-muted">{r.paymentMethod.replace(/_/g, " ")}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-fg-2">{r.categoryName ?? <span className="text-muted">Uncategorized</span>}</td>
                      <td className={clsx("num px-3 py-1.5 text-right", r.type === "INCOME" && "text-pos")}>
                        {r.amount != null ? `${r.type === "INCOME" ? "+" : "−"}${formatMoney(r.amount, fmt)}` : "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {r.status === "ready" ? <Badge tone="pos">Ready</Badge> : r.status === "duplicate" ? <Badge tone="warn">Duplicate</Badge> : r.status === "error" ? <Badge tone="neg">Error</Badge> : <Badge>Excluded</Badge>}
                        {r.errors.length > 0 && <span className="ml-1.5 text-[11px] text-fg-2">{r.errors.join("; ")}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-[11.5px] text-muted">
            Changing a checkbox requires re-validation. Duplicates are excluded unless you tick them. Categories are matched by name or learned from your past transactions with the same merchant; UPI/NEFT narrations are parsed for the merchant name.
          </p>
        </Card>
      )}
    </div>
  );
}
