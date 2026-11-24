"use client";

import { useState } from "react";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "./ui/form";
import { FREQUENCIES, FREQUENCY_LABELS } from "@/lib/finance/recurring";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/finance/types";

export interface RuleOptions {
  accounts: { id: string; name: string; type: string }[];
  categories: { id: string; label: string; kind: string }[];
  loans: { id: string; name: string; accountId: string }[];
  today: string;
  sym: string;
}
export interface RuleInitial {
  id?: string;
  name?: string;
  kind?: string;
  billType?: string | null;
  txType?: string;
  amount?: string;
  accountId?: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  merchant?: string | null;
  paymentMethod?: string | null;
  frequency?: string;
  interval?: number;
  startDate?: string;
  endDate?: string | null;
  autoPost?: boolean;
  reminderDays?: number;
  loanId?: string | null;
  notes?: string | null;
}

export const BILL_TYPES: Record<string, string> = {
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  WATER: "Water",
  GAS: "Gas / LPG",
  INTERNET: "Internet",
  MOBILE: "Mobile",
  INSURANCE: "Insurance",
  CREDIT_CARD: "Credit card payment",
  EMI: "Loan EMI",
  OTT: "OTT / streaming",
  SOFTWARE: "Software",
  MEMBERSHIP: "Membership",
  OTHER: "Other",
};

const KIND_LABELS: Record<string, string> = {
  BILL: "Bill",
  SUBSCRIPTION: "Subscription",
  EMI: "Loan EMI",
  INCOME: "Income",
  TRANSFER: "Transfer / savings",
  OTHER: "Other",
};

export function RuleFields({ options, initial = {} }: { options: RuleOptions; initial?: RuleInitial }) {
  const [kind, setKind] = useState(initial.kind ?? "BILL");
  const txType = kind === "INCOME" ? "INCOME" : kind === "TRANSFER" ? "TRANSFER" : kind === "EMI" ? "LOAN_REPAYMENT" : "EXPENSE";
  const catKind = txType === "INCOME" ? "INCOME" : "EXPENSE";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="txType" value={txType} />
      <Field label="Name" name="name" required>
        <Input name="name" defaultValue={initial.name ?? ""} placeholder="e.g. Electricity bill" />
      </Field>
      <Field label="Kind" name="kind">
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(KIND_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      {(kind === "BILL" || kind === "SUBSCRIPTION") && (
        <Field label="Bill type" name="billType">
          <Select name="billType" defaultValue={initial.billType ?? "OTHER"}>
            {Object.entries(BILL_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Amount" name="amount" required>
        <MoneyInput name="amount" currencySymbol={options.sym} defaultValue={initial.amount ?? ""} />
      </Field>
      <Field label={txType === "INCOME" ? "Received into" : "Paid from"} name="accountId" required>
        <Select name="accountId" defaultValue={initial.accountId ?? ""}>
          <option value="">Choose…</option>
          {options.accounts
            .filter((a) => a.type !== "LOAN")
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </Select>
      </Field>
      {txType === "TRANSFER" && (
        <Field label="To account" name="toAccountId" required>
          <Select name="toAccountId" defaultValue={initial.toAccountId ?? ""}>
            <option value="">Choose…</option>
            {options.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {txType === "LOAN_REPAYMENT" && (
        <Field label="Loan" name="loanId" hint="Each EMI is split into principal and interest automatically">
          <Select name="loanId" defaultValue={initial.loanId ?? ""}>
            <option value="">Choose loan…</option>
            {options.loans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {txType !== "TRANSFER" && (
        <Field label="Category" name="categoryId">
          <Select name="categoryId" defaultValue={initial.categoryId ?? ""}>
            <option value="">Uncategorized</option>
            {options.categories
              .filter((c) => c.kind === catKind)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </Select>
        </Field>
      )}
      <Field label={txType === "INCOME" ? "Payer" : "Payee / merchant"} name="merchant">
        <Input name="merchant" defaultValue={initial.merchant ?? ""} />
      </Field>
      <Field label="Payment method" name="paymentMethod">
        <Select name="paymentMethod" defaultValue={initial.paymentMethod ?? ""}>
          <option value="">—</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Frequency" name="frequency">
        <div className="flex gap-2">
          <span className="self-center text-[12.5px] text-muted">Every</span>
          <Input name="interval" type="number" min={1} max={12} defaultValue={initial.interval ?? 1} className="w-16" aria-label="Interval" />
          <Select name="frequency" defaultValue={initial.frequency ?? "MONTHLY"}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABELS[f]}
              </option>
            ))}
          </Select>
        </div>
      </Field>
      <Field label="First / next due date" name="startDate" required>
        <Input name="startDate" type="date" defaultValue={initial.startDate ?? options.today} />
      </Field>
      <Field label="End date (optional)" name="endDate">
        <Input name="endDate" type="date" defaultValue={initial.endDate ?? ""} />
      </Field>
      <Field label="Remind me (days before)" name="reminderDays">
        <Input name="reminderDays" type="number" min={0} max={30} defaultValue={initial.reminderDays ?? 3} />
      </Field>
      <div className="flex items-end pb-2">
        <Checkbox name="autoPost" label="Record automatically when due" defaultChecked={initial.autoPost ?? false} />
      </div>
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} />
      </Field>
    </div>
  );
}
