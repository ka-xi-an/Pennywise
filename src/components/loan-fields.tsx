"use client";

import { useMemo, useState } from "react";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "./ui/form";
import { LOAN_TYPES, LOAN_TYPE_LABELS, computeEMI } from "@/lib/finance/loans";
import { parseMoney } from "@/lib/finance/money";
import { formatMoney } from "@/lib/format";

export function LoanFields({ accounts, today, sym, currency }: { accounts: { id: string; name: string }[]; today: string; sym: string; currency: string }) {
  const [mode, setMode] = useState<"EXISTING" | "NEW">("EXISTING");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [tenure, setTenure] = useState("");
  const [schedule, setSchedule] = useState(true);
  const emi = useMemo(() => {
    const p = parseMoney(principal || "0") ?? 0;
    const r = Number(rate);
    const n = Number(tenure);
    return p > 0 && Number.isFinite(r) && n > 0 ? computeEMI(p, r, n) : null;
  }, [principal, rate, tenure]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="currency" value={currency} />
      <div className="flex gap-2 sm:col-span-2">
        {(["EXISTING", "NEW"] as const).map((m) => (
          <label key={m} className={`flex flex-1 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px] ${mode === m ? "border-fg bg-surface-2" : "border-line"}`}>
            <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="mt-0.5 accent-[var(--accent)]" />
            <span>
              <span className="font-medium">{m === "EXISTING" ? "Existing loan" : "New loan"}</span>
              <span className="block text-muted">{m === "EXISTING" ? "Already running — enter today's outstanding" : "Disbursed now into one of your accounts"}</span>
            </span>
          </label>
        ))}
      </div>
      <Field label="Loan name" name="name">
        <Input name="name" placeholder="e.g. Home loan" />
      </Field>
      <Field label="Type" name="loanType">
        <Select name="loanType" defaultValue="HOME">
          {LOAN_TYPES.map((t) => (
            <option key={t} value={t}>
              {LOAN_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Lender" name="lender">
        <Input name="lender" />
      </Field>
      <Field label="Sanctioned amount" name="principal">
        <MoneyInput name="principal" currencySymbol={sym} value={principal} onChange={(e) => setPrincipal(e.target.value)} />
      </Field>
      <Field label="Interest rate (% p.a.)" name="interestRate">
        <Input name="interestRate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
      </Field>
      <Field label="Tenure (months)" name="tenureMonths">
        <Input name="tenureMonths" type="number" min={1} max={480} value={tenure} onChange={(e) => setTenure(e.target.value)} />
      </Field>
      <Field label="Start date" name="startDate">
        <Input name="startDate" type="date" defaultValue={today} />
      </Field>
      <Field label="EMI" name="emi" hint={emi != null ? `Calculated: ${formatMoney(emi, { currency, locale: "en-IN", dateFormat: "" })} — leave blank to use it, or enter your lender's figure` : "Leave blank to calculate"}>
        <MoneyInput name="emi" currencySymbol={sym} />
      </Field>
      <Field label="EMI day of month" name="emiDay">
        <Input name="emiDay" type="number" min={1} max={28} defaultValue={5} />
      </Field>
      {mode === "EXISTING" ? (
        <>
          <Field label="Outstanding principal today" name="outstanding" hint="From your latest loan statement">
            <MoneyInput name="outstanding" currencySymbol={sym} />
          </Field>
          <Field label="As of" name="asOfDate">
            <Input name="asOfDate" type="date" defaultValue={today} />
          </Field>
        </>
      ) : (
        <Field label="Disbursed into" name="disburseToAccountId" className="sm:col-span-2">
          <Select name="disburseToAccountId">
            <option value="">Choose account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="space-y-2 rounded-lg bg-surface-2 p-3 sm:col-span-2">
        <Checkbox name="createEmiSchedule" label="Create a monthly EMI schedule (reminders & payment calendar)" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
        {schedule && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Select name="emiAccountId" aria-label="EMI paid from">
              <option value="">EMI paid from…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
            <Checkbox name="autoPostEmi" label="Auto-post each EMI (split into principal & interest)" defaultChecked />
          </div>
        )}
      </div>
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} />
      </Field>
    </div>
  );
}
