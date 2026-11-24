"use client";

import { useState } from "react";
import { Field, Input, MoneyInput, Select, Textarea } from "./ui/form";
import { GOAL_TYPES, GOAL_TYPE_LABELS } from "@/lib/finance/goals";

export interface GoalInitial {
  id?: string;
  name?: string;
  type?: string;
  targetAmount?: string;
  targetDate?: string | null;
  priority?: number;
  monthlyContribution?: string;
  trackingMode?: string;
  startingAmount?: string;
  expectedReturn?: string | null;
  accountIds?: string[];
  notes?: string | null;
}

export function GoalFields({ initial = {}, accounts, sym }: { initial?: GoalInitial; accounts: { id: string; name: string; type: string }[]; sym: string }) {
  const [mode, setMode] = useState(initial.trackingMode ?? "MANUAL");
  const [type, setType] = useState(initial.type ?? "SAVINGS");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Goal name" name="name" required>
        <Input name="name" defaultValue={initial.name ?? ""} />
      </Field>
      <Field label="Type" name="type">
        <Select
          name="type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            if (e.target.value === "NET_WORTH") setMode("NET_WORTH");
          }}
        >
          {GOAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {GOAL_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Target amount" name="targetAmount" required hint={type === "DEBT_FREE" ? "Total debt to clear (link the loan/card accounts)" : undefined}>
        <MoneyInput name="targetAmount" currencySymbol={sym} defaultValue={initial.targetAmount ?? ""} />
      </Field>
      <Field label="Target date" name="targetDate">
        <Input name="targetDate" type="date" defaultValue={initial.targetDate ?? ""} />
      </Field>
      <Field label="Track progress by" name="trackingMode">
        <Select name="trackingMode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="MANUAL">Contributions I record</option>
          <option value="ACCOUNTS">Balances of linked accounts</option>
          <option value="NET_WORTH">My total net worth</option>
        </Select>
      </Field>
      <Field label="Priority" name="priority">
        <Select name="priority" defaultValue={String(initial.priority ?? 2)}>
          <option value="1">High</option>
          <option value="2">Medium</option>
          <option value="3">Low</option>
        </Select>
      </Field>
      {mode === "MANUAL" && (
        <Field label="Already saved" name="startingAmount">
          <MoneyInput name="startingAmount" currencySymbol={sym} defaultValue={initial.startingAmount ?? ""} />
        </Field>
      )}
      <Field label="Planned monthly contribution" name="monthlyContribution">
        <MoneyInput name="monthlyContribution" currencySymbol={sym} defaultValue={initial.monthlyContribution ?? ""} />
      </Field>
      <Field label="Expected annual return % (assumption)" name="expectedReturn" hint="Leave blank for a straight-line projection">
        <Input name="expectedReturn" inputMode="decimal" defaultValue={initial.expectedReturn ?? ""} />
      </Field>
      {mode === "ACCOUNTS" && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-[12.5px] font-medium text-fg-2">Linked accounts</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" name="accountIds[]" value={a.id} defaultChecked={initial.accountIds?.includes(a.id)} className="size-4 accent-[var(--accent)]" />
                {a.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} />
      </Field>
    </div>
  );
}
