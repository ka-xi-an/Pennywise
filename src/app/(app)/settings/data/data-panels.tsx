"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, ShieldAlert, Upload } from "lucide-react";
import { btnClass, Card, CardHeader } from "@/components/ui/core";
import { useToast } from "@/components/ui/toast";
import { applyBackup, downloadBackup, eraseAllData, inspectBackup } from "../data-actions";

const inp = "h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px]";

export function BackupPanel() {
  const [pass, setPass] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Card>
      <CardHeader title="Backup" subtitle="A complete JSON copy of your financial data. Optionally encrypt it with a passphrase (scrypt + AES-256-GCM)." />
      <div className="flex flex-wrap items-end gap-2 px-5 pb-5">
        <label className="min-w-[220px] flex-1 text-[12.5px] font-medium text-fg-2">
          Passphrase (optional, 10+ characters)
          <input type="password" className={`${inp} mt-1`} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
        </label>
        <button
          className={btnClass("primary")}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await downloadBackup(pass || null);
              if (!r.ok) return toast.error(r.message);
              const d = r.data as { filename: string; content: string };
              const url = URL.createObjectURL(new Blob([d.content], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = d.filename;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(pass ? "Encrypted backup downloaded — keep the passphrase safe; it can't be recovered" : "Backup downloaded");
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download backup
        </button>
      </div>
      <p className="px-5 pb-4 text-[11.5px] text-muted">Uploaded receipt/document files are not inside the backup (their names are listed). Unencrypted backups contain readable financial data — store them securely.</p>
    </Card>
  );
}

export function RestorePanel() {
  const [text, setText] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [password, setPassword] = useState("");
  const [summary, setSummary] = useState<{ counts: Record<string, number>; exportedAt: string } | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const encrypted = !!text?.includes('"ledgerline-backup-encrypted"');
  return (
    <Card>
      <CardHeader title="Restore from backup" subtitle="Replaces ALL current financial data with the backup's contents. Runs in one transaction — if anything fails, nothing changes." />
      <div className="space-y-3 px-5 pb-5">
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <span className={btnClass("secondary")}>
            <Upload className="size-4" /> Choose backup file
          </span>
          <span className="text-muted">{name}</span>
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 50_000_000) return toast.error("Backup file is too large");
              setName(f.name);
              setText(await f.text());
              setSummary(null);
            }}
          />
        </label>
        {encrypted && (
          <label className="block text-[12.5px] font-medium text-fg-2">
            Backup passphrase
            <input type="password" className={`${inp} mt-1`} value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
        )}
        {text && !summary && (
          <button
            className={btnClass("secondary")}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await inspectBackup(text, pass || null);
                if (r.ok) setSummary((r.data as { counts: Record<string, number>; exportedAt: string }) ?? null);
                else toast.error(r.message);
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Check backup
          </button>
        )}
        {summary && (
          <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-[12.5px]">
            <p className="font-medium">Backup from {new Date(summary.exportedAt).toLocaleString("en-IN")}</p>
            <p className="mt-1 text-fg-2">
              {summary.counts.transaction ?? 0} transactions · {summary.counts.account ?? 0} accounts · {summary.counts.investmentHolding ?? 0} holdings · {summary.counts.budget ?? 0} budgets · {summary.counts.goal ?? 0} goals
            </p>
            <label className="mt-3 block font-medium text-fg-2">
              Confirm with your account password
              <input type="password" className={`${inp} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </label>
            <button
              className={btnClass("danger", "md", "mt-3")}
              disabled={pending || !password}
              onClick={() =>
                start(async () => {
                  const r = await applyBackup(text!, pass || null, password);
                  if (r.ok) {
                    toast.success(r.message ?? "Restored");
                    router.push("/dashboard");
                  } else toast.error(r.message);
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Replace my data with this backup
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

export function EraseCard() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Card className="border-neg/40">
      <CardHeader title={<span className="flex items-center gap-2 text-neg"><ShieldAlert className="size-4" /> Erase all financial data</span>} subtitle="Deletes every account, transaction, holding, budget, goal and report history but keeps your login. Cannot be undone." />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-[12.5px] font-medium text-fg-2">
          Password
          <input type="password" className={`${inp} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="text-[12.5px] font-medium text-fg-2">
          Type ERASE
          <input className={`${inp} mt-1`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button
          className={btnClass("danger")}
          disabled={pending || confirm !== "ERASE" || !password}
          onClick={() =>
            start(async () => {
              const r = await eraseAllData(password);
              if (r.ok) {
                toast.success(r.message ?? "Erased");
                router.push("/dashboard");
              } else toast.error(r.message);
            })
          }
        >
          Erase
        </button>
      </div>
    </Card>
  );
}
