"use client";

import { useState } from "react";
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from "./ui/form";

export interface AccountInitial {
  id?: string;
  name?: string;
  institution?: string | null;
  type?: string;
  currency?: string;
  openingBalance?: string;
  openingDate?: string;
  maskedNumber?: string | null;
  creditLimit?: string;
  includeInNetWorth?: boolean;
  notes?: string | null;
}

const TYPES: [string, string][] = [
  ["SAVINGS", "Savings account"],
  ["CURRENT", "Current account"],
  ["CASH", "Cash"],
  ["WALLET", "Digital wallet / UPI"],
  ["CREDIT_CARD", "Credit card"],
  ["INVESTMENT", "Investment / brokerage (cash)"],
  ["FOREIGN_CURRENCY", "Foreign currency account"],
];

export function AccountFields({ initial = {}, today, baseCurrency, sym }: { initial?: AccountInitial; today: string; baseCurrency: string; sym: string }) {
  const [type, setType] = useState(initial.type ?? "SAVINGS");
  const card = type === "CREDIT_CARD";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="_hasNW" value="1" />
      <Field label="Account name" name="name" required>
        <Input name="name" defaultValue={initial.name ?? ""} placeholder="e.g. Salary account" />
      </Field>
      <Field label="Type" name="type">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Institution" name="institution">
        <Input name="institution" defaultValue={initial.institution ?? ""} placeholder="Bank or provider" />
      </Field>
      <Field label="Currency" name="currency" hint="3-letter code, e.g. INR, USD">
        <Input name="currency" defaultValue={initial.currency ?? baseCurrency} maxLength={3} className="uppercase" />
      </Field>
      <Field label={card ? "Amount owed on opening date" : "Opening balance"} name="openingBalance" hint={card ? "Enter as a positive number" : "Negative for an overdraft"}>
        <MoneyInput name="openingBalance" currencySymbol={sym} defaultValue={initial.openingBalance ?? ""} />
      </Field>
      <Field label="Opening balance date" name="openingDate">
        <Input name="openingDate" type="date" defaultValue={initial.openingDate ?? today} />
      </Field>
      <Field label="Last 4 digits" name="maskedNumber" hint="Only the last 4 digits are ever stored">
        <Input name="maskedNumber" inputMode="numeric" maxLength={4} defaultValue={initial.maskedNumber ?? ""} />
      </Field>
      {card && (
        <Field label="Credit limit" name="creditLimit">
          <MoneyInput name="creditLimit" currencySymbol={sym} defaultValue={initial.creditLimit ?? ""} />
        </Field>
      )}
      <div className="flex items-end pb-2">
        <Checkbox name="includeInNetWorth" label="Include in net worth" defaultChecked={initial.includeInNetWorth ?? true} />
      </div>
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} />
      </Field>
    </div>
  );
}
