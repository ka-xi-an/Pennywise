"use client";

import { useState } from "react";
import { Field, Input, MoneyInput, Select, Textarea } from "./ui/form";
import { ASSET_CLASSES, ASSET_CLASS_LABELS, VALUE_MODE_DEFAULT, type AssetClass } from "@/lib/finance/investments";

export interface HoldingInitial {
  id?: string;
  name?: string;
  symbol?: string | null;
  isin?: string | null;
  exchange?: string | null;
  assetClass?: string;
  valuationMode?: string;
  currency?: string;
  accountId?: string | null;
  interestRate?: string | null;
  maturityDate?: string | null;
  notes?: string | null;
}

export function HoldingFields({ initial = {}, accounts, baseCurrency, defaultClass }: { initial?: HoldingInitial; accounts: { id: string; name: string }[]; baseCurrency: string; defaultClass?: string }) {
  const [cls, setCls] = useState<AssetClass>((initial.assetClass ?? defaultClass ?? "MUTUAL_FUND") as AssetClass);
  const [mode, setMode] = useState(initial.valuationMode ?? (VALUE_MODE_DEFAULT.includes(cls) ? "VALUE" : "UNITS"));
  const fixedIncome = ["FIXED_DEPOSIT", "BOND", "PPF", "EPF", "NPS"].includes(cls);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Name" name="name" required className="sm:col-span-2">
        <Input name="name" defaultValue={initial.name ?? ""} placeholder="e.g. Nifty 50 Index Fund – Direct Growth" />
      </Field>
      <Field label="Asset class" name="assetClass">
        <Select
          name="assetClass"
          value={cls}
          onChange={(e) => {
            const c = e.target.value as AssetClass;
            setCls(c);
            if (!initial.id) setMode(VALUE_MODE_DEFAULT.includes(c) ? "VALUE" : "UNITS");
          }}
        >
          {ASSET_CLASSES.map((c) => (
            <option key={c} value={c}>
              {ASSET_CLASS_LABELS[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Valuation" name="valuationMode" hint={mode === "UNITS" ? "Value = units × price" : "Value entered directly (FD, PPF, EPF…)"}>
        <Select name="valuationMode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="UNITS">Units × price</option>
          <option value="VALUE">Lump-sum value</option>
        </Select>
      </Field>
      {mode === "UNITS" && (
        <>
          <Field label="Symbol / scheme code" name="symbol">
            <Input name="symbol" defaultValue={initial.symbol ?? ""} placeholder="e.g. INFY" />
          </Field>
          <Field label="Exchange" name="exchange">
            <Select name="exchange" defaultValue={initial.exchange ?? ""}>
              <option value="">—</option>
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
              <option value="OTHER">Other</option>
            </Select>
          </Field>
          <Field label="ISIN (optional)" name="isin">
            <Input name="isin" defaultValue={initial.isin ?? ""} maxLength={12} className="uppercase" />
          </Field>
        </>
      )}
      <Field label="Held in account" name="accountId" hint="Brokerage/demat account (optional)">
        <Select name="accountId" defaultValue={initial.accountId ?? ""}>
          <option value="">— None —</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Currency" name="currency">
        <Input name="currency" defaultValue={initial.currency ?? baseCurrency} maxLength={3} className="uppercase" />
      </Field>
      {fixedIncome && (
        <>
          <Field label="Interest rate (% p.a.)" name="interestRate">
            <Input name="interestRate" inputMode="decimal" defaultValue={initial.interestRate ?? ""} />
          </Field>
          <Field label="Maturity date" name="maturityDate">
            <Input name="maturityDate" type="date" defaultValue={initial.maturityDate ?? ""} />
          </Field>
        </>
      )}
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} />
      </Field>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  BUY: "Buy",
  SIP: "SIP instalment",
  SELL: "Sell / redeem",
  DIVIDEND: "Dividend",
  INTEREST: "Interest payout",
  BONUS: "Bonus units",
  SPLIT: "Stock split",
  MERGER: "Merger / conversion",
  FEES: "Fees & charges",
  TAX_WITHHOLDING: "Tax withheld (TDS)",
};

export function InvTxFields({
  holdings,
  accounts,
  today,
  sym,
  fixedHoldingId,
}: {
  holdings: { id: string; name: string; valuationMode: string; accountId: string | null }[];
  accounts: { id: string; name: string }[];
  today: string;
  sym: string;
  fixedHoldingId?: string;
}) {
  const [holdingId, setHoldingId] = useState(fixedHoldingId ?? holdings[0]?.id ?? "");
  const [type, setType] = useState("BUY");
  const h = holdings.find((x) => x.id === holdingId);
  const units = h?.valuationMode !== "VALUE";
  const trade = ["BUY", "SIP", "SELL"].includes(type);
  const cash = !["BONUS", "SPLIT", "MERGER"].includes(type);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fixedHoldingId ? (
        <input type="hidden" name="holdingId" value={fixedHoldingId} />
      ) : (
        <Field label="Holding" name="holdingId" className="sm:col-span-2">
          <Select name="holdingId" value={holdingId} onChange={(e) => setHoldingId(e.target.value)}>
            {holdings.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Type" name="type">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TYPE_LABELS)
            .filter(([k]) => units || !["BONUS", "SPLIT", "MERGER"].includes(k))
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Date" name="date">
        <Input name="date" type="date" defaultValue={today} />
      </Field>
      {trade && units && (
        <>
          <Field label="Units" name="quantity">
            <Input name="quantity" inputMode="decimal" placeholder="e.g. 12.345" />
          </Field>
          <Field label="Price per unit / NAV" name="price">
            <Input name="price" inputMode="decimal" />
          </Field>
        </>
      )}
      {((trade && !units) || ["DIVIDEND", "INTEREST", "FEES", "TAX_WITHHOLDING"].includes(type)) && (
        <Field label="Amount" name="amount">
          <MoneyInput name="amount" currencySymbol={sym} />
        </Field>
      )}
      {type === "BONUS" && (
        <Field label="Bonus units received" name="quantity" hint="Or enter a ratio below">
          <Input name="quantity" inputMode="decimal" />
        </Field>
      )}
      {["SPLIT", "MERGER", "BONUS"].includes(type) && (
        <Field label={type === "BONUS" ? "Bonus ratio (new per held)" : "New units per old unit"} name="ratio" hint={type === "SPLIT" ? "1:5 split → 5" : type === "MERGER" ? "e.g. 0.75 new shares per old" : "1:1 bonus → 1"}>
          <Input name="ratio" inputMode="decimal" />
        </Field>
      )}
      {trade && (
        <Field label="Brokerage, STT & charges" name="fees">
          <MoneyInput name="fees" currencySymbol={sym} />
        </Field>
      )}
      {cash && (
        <Field label={type === "SELL" || type === "DIVIDEND" || type === "INTEREST" ? "Proceeds credited to" : "Paid from"} name="cashAccountId" hint="Leave empty for an opening position already owned (no cash movement)" className="sm:col-span-2">
          <Select name="cashAccountId" defaultValue={h?.accountId ?? ""}>
            <option value="">— No cash movement —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Input name="notes" />
      </Field>
    </div>
  );
}
