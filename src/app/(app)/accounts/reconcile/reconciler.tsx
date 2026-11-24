"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ActionForm, Checkbox, Field, Input, MoneyInput, SubmitButton } from "@/components/ui/form";
import { Card } from "@/components/ui/core";
import { formatMoney } from "@/lib/format";
import { parseMoney } from "@/lib/finance/money";
import { completeReconciliation } from "../actions";

interface Item {
  id: string;
  date: string;
  dateText: string;
  title: string;
  effect: number;
}

export function Reconciler(p: {
  accountId: string;
  accountName: string;
  isCard: boolean;
  currency: string;
  locale: string;
  dateFormat: string;
  today: string;
  clearedBalance: number;
  items: Item[];
}) {
  const [statementDate, setStatementDate] = useState(p.today);
  const [statementInput, setStatementInput] = useState("");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const fmt = { currency: p.currency, locale: p.locale, dateFormat: p.dateFormat };
  const visible = p.items.filter((i) => i.date <= statementDate);
  const cleared = useMemo(() => p.clearedBalance + visible.filter((i) => ticked.has(i.id)).reduce((s, i) => s + i.effect, 0), [p.clearedBalance, visible, ticked]);
  const raw = parseMoney(statementInput || "0", p.currency) ?? 0;
  const statement = p.isCard ? -Math.abs(raw) : raw;
  const diff = statement - cleared;

  return (
    <ActionForm action={completeReconciliation} className="grid gap-4 lg:grid-cols-12" onSuccess={() => setTicked(new Set())}>
      <input type="hidden" name="accountId" value={p.accountId} />
      {[...ticked].map((id) => (
        <input key={id} type="hidden" name="cleared[]" value={id} />
      ))}
      <Card className="h-fit p-5 lg:col-span-4">
        <p className="mb-4 text-[13.5px] font-semibold">{p.accountName} statement</p>
        <div className="grid gap-4">
          <Field label="Statement date" name="statementDate">
            <Input name="statementDate" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
          </Field>
          <Field label={p.isCard ? "Statement amount owed" : "Statement closing balance"} name="statementBalance">
            <MoneyInput name="statementBalance" currencySymbol={p.currency === "INR" ? "₹" : p.currency} value={statementInput} onChange={(e) => setStatementInput(e.target.value)} />
          </Field>
          <dl className="space-y-1.5 rounded-lg bg-surface-2 p-3 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-fg-2">Cleared balance</dt>
              <dd className="num font-medium">{formatMoney(cleared, fmt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-2">Statement</dt>
              <dd className="num font-medium">{formatMoney(statement, fmt)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-1.5">
              <dt className="font-semibold">Difference</dt>
              <dd className={clsx("num font-semibold", diff === 0 ? "text-pos" : "text-neg")}>{formatMoney(diff, fmt)}</dd>
            </div>
          </dl>
          <Checkbox name="createAdjustment" label="Post an adjustment for any remaining difference" />
          <SubmitButton>{diff === 0 ? "Finish — balances match" : "Finish reconciliation"}</SubmitButton>
        </div>
      </Card>
      <Card className="lg:col-span-8">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <p className="text-[13.5px] font-semibold">Uncleared transactions up to statement date</p>
          <button type="button" className="text-[12px] text-accent hover:underline" onClick={() => setTicked(new Set(visible.map((i) => i.id)))}>
            Tick all
          </button>
        </div>
        <ul className="thin-scroll max-h-[520px] divide-y divide-line overflow-y-auto">
          {visible.map((i) => (
            <li key={i.id}>
              <label className={clsx("flex cursor-pointer items-center gap-3 px-5 py-2.5 hover:bg-surface-2/60", ticked.has(i.id) && "bg-pos-soft/50")}>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={ticked.has(i.id)}
                  onChange={(e) =>
                    setTicked((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(i.id);
                      else n.delete(i.id);
                      return n;
                    })
                  }
                />
                <span className="num w-24 shrink-0 text-[12.5px] text-fg-2">{i.dateText}</span>
                <span className="flex-1 truncate text-[13px]">{i.title}</span>
                <span className={clsx("num text-[13px] font-medium", i.effect > 0 && "text-pos")}>
                  {i.effect > 0 ? "+" : "−"}
                  {formatMoney(Math.abs(i.effect), fmt)}
                </span>
              </label>
            </li>
          ))}
          {!visible.length && <li className="px-5 py-10 text-center text-[13px] text-muted">Everything up to this date is already cleared.</li>}
        </ul>
      </Card>
    </ActionForm>
  );
}
