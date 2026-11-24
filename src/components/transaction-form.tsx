"use client";

import { useMemo, useState } from "react";
import { ActionForm, Field, FormError, Input, MoneyInput, Select, SubmitButton, Textarea } from "./ui/form";
import { btnClass, cx } from "./ui/core";
import { saveTransaction } from "@/app/(app)/transactions/actions";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, TX_TYPE_LABELS, type TxType } from "@/lib/finance/types";

export interface TxFormOptions {
  accounts: { id: string; name: string; type: string; currency: string; status: string }[];
  categories: { id: string; name: string; kind: string; parentId: string | null }[];
  holdings: { id: string; name: string; valuationMode: string; accountId: string | null }[];
  loans: { id: string; name: string; accountId: string }[];
  templates: {
    id: string;
    name: string;
    type: string;
    amount: string;
    accountId: string | null;
    toAccountId: string | null;
    categoryId: string | null;
    merchant: string | null;
    paymentMethod: string | null;
    description: string | null;
  }[];
  today: string;
  currencySymbol: string;
}

export interface TxFormInitial {
  id?: string;
  type?: TxType;
  amount?: string;
  date?: string;
  accountId?: string;
  toAccountId?: string | null;
  toAmount?: string;
  categoryId?: string | null;
  merchant?: string | null;
  paymentMethod?: string | null;
  description?: string | null;
  notes?: string | null;
  tags?: string;
  principalAmount?: string;
  interestAmount?: string;
  loanId?: string | null;
  refundOfId?: string | null;
  refundOfLabel?: string;
  holdingId?: string | null;
  quantity?: string | null;
  price?: string | null;
  fees?: string;
}

const PRIMARY: TxType[] = ["EXPENSE", "INCOME", "TRANSFER"];
const MORE: TxType[] = ["REFUND", "INVESTMENT_BUY", "INVESTMENT_SELL", "DIVIDEND", "INTEREST", "LOAN_REPAYMENT", "LOAN_DISBURSEMENT", "ADJUSTMENT"];

function CategorySelect({ categories, kind, defaultValue }: { categories: TxFormOptions["categories"]; kind: "INCOME" | "EXPENSE"; defaultValue?: string | null }) {
  const parents = categories.filter((c) => c.kind === kind && !c.parentId);
  return (
    <Select name="categoryId" defaultValue={defaultValue ?? ""}>
      <option value="">Uncategorized</option>
      {parents.map((p) => (
        <optgroup key={p.id} label={p.name}>
          <option value={p.id}>{p.name}</option>
          {categories
            .filter((c) => c.parentId === p.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {p.name} › {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function TransactionForm({
  options,
  initial = {},
  onDone,
  lockType = false,
}: {
  options: TxFormOptions;
  initial?: TxFormInitial;
  onDone?: () => void;
  lockType?: boolean;
}) {
  const [type, setType] = useState<TxType>(initial.type ?? "EXPENSE");
  const [template, setTemplate] = useState<TxFormOptions["templates"][number] | null>(null);
  const [formKey, setFormKey] = useState(0);
  const active = options.accounts.filter((a) => a.status === "ACTIVE" || a.id === initial.accountId);
  const v = { ...initial, ...(template ? { ...template, amount: template.amount } : {}) } as TxFormInitial;
  const [accountId, setAccountId] = useState(v.accountId ?? active.find((a) => a.type !== "LOAN")?.id ?? "");
  const [toAccountId, setToAccountId] = useState(v.toAccountId ?? "");
  const from = options.accounts.find((a) => a.id === accountId);
  const to = options.accounts.find((a) => a.id === toAccountId);
  const crossCurrency = !!(from && to && from.currency !== to.currency);

  const isTransferLike = type === "TRANSFER" || type === "LOAN_DISBURSEMENT";
  const isInvestment = type === "INVESTMENT_BUY" || type === "INVESTMENT_SELL";
  const incomeCat = type === "INCOME" || type === "DIVIDEND" || type === "INTEREST";
  const expenseCat = type === "EXPENSE" || type === "REFUND" || type === "LOAN_REPAYMENT";
  const sourceAccounts = useMemo(
    () => active.filter((a) => (type === "LOAN_DISBURSEMENT" ? a.type === "LOAN" : type === "LOAN_REPAYMENT" || isInvestment ? a.type !== "LOAN" : true)),
    [active, type, isInvestment],
  );

  return (
    <ActionForm
      key={formKey}
      action={saveTransaction}
      className="grid gap-4"
      onSuccess={() => {
        if (!initial.id) {
          setFormKey((k) => k + 1);
          setTemplate(null);
        }
        onDone?.();
      }}
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="type" value={type} />
      {initial.refundOfId && <input type="hidden" name="refundOfId" value={initial.refundOfId} />}

      {!lockType && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5" role="radiogroup" aria-label="Transaction type">
            {PRIMARY.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={cx(
                  "rounded-md px-3 py-1 text-[12.5px] font-medium transition-colors",
                  type === t ? "bg-surface text-fg shadow-card" : "text-muted hover:text-fg",
                )}
              >
                {TX_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <select
            aria-label="Other transaction types"
            value={MORE.includes(type) ? type : ""}
            onChange={(e) => e.target.value && setType(e.target.value as TxType)}
            className={cx(btnClass("secondary", "sm"), "pr-7")}
          >
            <option value="">More types…</option>
            {MORE.map((t) => (
              <option key={t} value={t}>
                {TX_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {!initial.id && options.templates.length > 0 && (
            <select
              aria-label="Apply a template"
              className={cx(btnClass("ghost", "sm"), "ml-auto pr-7")}
              value=""
              onChange={(e) => {
                const t = options.templates.find((x) => x.id === e.target.value);
                if (t) {
                  setTemplate(t);
                  setType(t.type as TxType);
                  if (t.accountId) setAccountId(t.accountId);
                  if (t.toAccountId) setToAccountId(t.toAccountId);
                  setFormKey((k) => k + 1);
                }
              }}
            >
              <option value="">Use template…</option>
              {options.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {initial.refundOfLabel && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-fg-2">
          Refund of <span className="font-medium text-fg">{initial.refundOfLabel}</span> — the category spend is reduced; this is not income.
        </p>
      )}
      {type === "ADJUSTMENT" && (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-fg-2">
          Adjustments correct a balance without affecting income or expenses. Use a negative amount to decrease the balance.
        </p>
      )}
      {isInvestment && (
        <p className="rounded-lg bg-info-soft px-3 py-2 text-[12.5px] text-fg-2">
          Investment purchases move money into a holding — they are not counted as spending.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {isInvestment ? (
          <>
            <Field label="Holding" name="holdingId" required className="sm:col-span-2">
              <Select name="holdingId" defaultValue={v.holdingId ?? ""}>
                <option value="">Choose holding…</option>
                {options.holdings.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity (units)" name="quantity" hint="Leave blank for value-based holdings (FD, PPF…)">
              <Input name="quantity" inputMode="decimal" defaultValue={v.quantity ?? ""} />
            </Field>
            <Field label="Price per unit" name="price">
              <Input name="price" inputMode="decimal" defaultValue={v.price ?? ""} />
            </Field>
            <Field label="Amount" name="amount" hint="Used when quantity × price is not given">
              <MoneyInput name="amount" currencySymbol={options.currencySymbol} defaultValue={v.amount ?? ""} />
            </Field>
            <Field label="Fees & charges" name="fees">
              <MoneyInput name="fees" currencySymbol={options.currencySymbol} defaultValue={v.fees ?? ""} />
            </Field>
          </>
        ) : (
          <Field label={type === "ADJUSTMENT" ? "Amount (±)" : "Amount"} name="amount" required>
            <MoneyInput name="amount" currencySymbol={options.currencySymbol} defaultValue={v.amount ?? ""} autoFocus={!initial.id} />
          </Field>
        )}
        <Field label="Date" name="date" required>
          <Input name="date" type="date" defaultValue={v.date ?? options.today} />
        </Field>

        <Field
          label={isTransferLike ? "From account" : type === "LOAN_REPAYMENT" ? "Paid from" : isInvestment ? "Cash account" : "Account"}
          name="accountId"
          required
        >
          <Select name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Choose account…</option>
            {sourceAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.currency !== "INR" ? `(${a.currency})` : ""}
              </option>
            ))}
          </Select>
        </Field>

        {isTransferLike && (
          <Field label="To account" name="toAccountId" required>
            <Select name="toAccountId" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose account…</option>
              {active
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.currency !== "INR" ? `(${a.currency})` : ""}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        {isTransferLike && crossCurrency && (
          <Field label={`Amount received (${to?.currency})`} name="toAmount" required hint="Cross-currency transfer: enter the credited amount">
            <MoneyInput name="toAmount" currencySymbol={to?.currency ?? ""} defaultValue={v.toAmount ?? ""} />
          </Field>
        )}

        {type === "LOAN_REPAYMENT" && (
          <>
            <Field label="Loan" name="loanId" hint="Leave principal/interest blank to auto-split using the loan's rate">
              <Select name="loanId" defaultValue={v.loanId ?? ""}>
                <option value="">Choose loan…</option>
                {options.loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Principal portion" name="principalAmount">
              <MoneyInput name="principalAmount" currencySymbol={options.currencySymbol} defaultValue={v.principalAmount ?? ""} />
            </Field>
            <Field label="Interest portion" name="interestAmount">
              <MoneyInput name="interestAmount" currencySymbol={options.currencySymbol} defaultValue={v.interestAmount ?? ""} />
            </Field>
          </>
        )}

        {(type === "DIVIDEND" || type === "INTEREST") && options.holdings.length > 0 && (
          <Field label="From holding (optional)" name="holdingId" hint="Links the payout to the holding's return">
            <Select name="holdingId" defaultValue={v.holdingId ?? ""}>
              <option value="">None</option>
              {options.holdings.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {(incomeCat || expenseCat) && (
          <Field label="Category" name="categoryId">
            <CategorySelect categories={options.categories} kind={incomeCat ? "INCOME" : "EXPENSE"} defaultValue={v.categoryId} />
          </Field>
        )}

        {!isInvestment && type !== "ADJUSTMENT" && (
          <Field label={incomeCat ? "Payer / source" : "Merchant / recipient"} name="merchant">
            <Input name="merchant" defaultValue={v.merchant ?? ""} placeholder={incomeCat ? "e.g. Employer" : "e.g. BigBasket"} />
          </Field>
        )}
        {(type === "EXPENSE" || type === "INCOME" || type === "TRANSFER" || type === "LOAN_REPAYMENT" || type === "REFUND") && (
          <Field label="Payment method" name="paymentMethod">
            <Select name="paymentMethod" defaultValue={v.paymentMethod ?? ""}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Description" name="description" className="sm:col-span-2">
          <Input name="description" defaultValue={v.description ?? ""} />
        </Field>
        <Field label="Tags" name="tags" hint="Comma separated, e.g. trip-goa, reimbursable">
          <Input name="tags" defaultValue={v.tags ?? ""} />
        </Field>
        <Field label="Notes" name="notes">
          <Textarea name="notes" defaultValue={v.notes ?? ""} rows={1} />
        </Field>
      </div>
      <FormError />
      <div className="-mx-5 -mb-4 flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
        {onDone && (
          <button type="button" className={btnClass("ghost")} onClick={onDone}>
            Cancel
          </button>
        )}
        <SubmitButton>{initial.id ? "Save changes" : "Save transaction"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
