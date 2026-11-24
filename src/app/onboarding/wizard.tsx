"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import clsx from "clsx";
import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, SubmitButton } from "@/components/ui/form";
import { Badge, btnClass, Card } from "@/components/ui/core";
import { useToast } from "@/components/ui/toast";
import { savePreferences, completeOnboarding } from "@/app/(app)/settings/actions";
import { saveAccount } from "@/app/(app)/accounts/actions";
import { archiveCategory, saveCategory } from "@/app/(app)/categories/actions";
import { saveRule } from "@/app/(app)/recurring/actions";
import { saveAsset, saveLiability } from "@/app/(app)/wealth/actions";
import { saveGoal } from "@/app/(app)/goals/actions";
import { startDemo } from "@/app/(app)/settings/demo-actions";
import { minorToInput } from "@/lib/format";
import { MANUAL_ASSET_LABELS, MANUAL_LIABILITY_LABELS } from "@/lib/finance/networth";
import { GOAL_TYPE_LABELS } from "@/lib/finance/goals";
import { addMonths } from "@/lib/finance/dates";

const STEPS = ["Preferences", "Accounts", "Categories", "Income", "Assets & debts", "Goals"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Props {
  name: string;
  today: string;
  prefs: { baseCurrency: string; locale: string; timezone: string; fyStartMonth: number; dateFormat: string; largeExpenseThreshold: number; emergencyFundMonths: number };
  accounts: { id: string; name: string; type: string; rawType: string; balance: string }[];
  categories: { id: string; name: string; kind: string; archived: boolean; color: string }[];
  incomeCategoryId: string | null;
  counts: { assets: number; liabilities: number; goals: number; rules: number };
}

export function OnboardingWizard(p: Props) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const finish = () => start(async () => void (await completeOnboarding()));
  const sym = p.prefs.baseCurrency === "INR" ? "₹" : p.prefs.baseCurrency;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted">Welcome, {p.name.split(" ")[0]}</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Set up your financial command center</h1>
          <p className="mt-1 text-[13px] text-fg-2">Each step is optional — you can change everything later in Settings.</p>
        </div>
        <button
          className={btnClass("ai", "md")}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await startDemo();
              if (r.ok) {
                toast.success(r.message ?? "Demo data loaded");
                router.push("/dashboard");
              } else toast.error(r.message);
            })
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Explore with demo data
        </button>
      </div>

      <ol className="mb-6 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              onClick={() => setStep(i)}
              className={clsx(
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] font-medium transition-colors",
                i === step ? "border-fg bg-surface text-fg" : i < step ? "border-line bg-surface text-fg-2" : "border-line text-muted",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              <span className={clsx("flex size-5 shrink-0 items-center justify-center rounded-full text-[10.5px]", i < step ? "bg-pos text-white" : "bg-surface-3")}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="truncate">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <Card className="p-5">
        {step === 0 && (
          <ActionForm action={savePreferences} onSuccess={next} className="grid gap-4 sm:grid-cols-2">
            <StepTitle title="Currency, locale and financial year" text="India defaults are pre-selected: INR, en-IN numbering (lakh/crore), April–March FY." />
            <Field label="Base currency" name="baseCurrency">
              <Select name="baseCurrency" defaultValue={p.prefs.baseCurrency}>
                {["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Number & locale format" name="locale">
              <Select name="locale" defaultValue={p.prefs.locale}>
                <option value="en-IN">English (India) — 1,23,456.00</option>
                <option value="en-US">English (US) — 123,456.00</option>
                <option value="en-GB">English (UK) — 123,456.00</option>
                <option value="de-DE">German — 123.456,00</option>
              </Select>
            </Field>
            <Field label="Financial year starts in" name="fyStartMonth">
              <Select name="fyStartMonth" defaultValue={String(p.prefs.fyStartMonth)}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date format" name="dateFormat">
              <Select name="dateFormat" defaultValue={p.prefs.dateFormat}>
                <option>DD/MM/YYYY</option>
                <option>MM/DD/YYYY</option>
                <option>YYYY-MM-DD</option>
                <option>DD MMM YYYY</option>
              </Select>
            </Field>
            <Field label="Timezone" name="timezone">
              <Input name="timezone" defaultValue={p.prefs.timezone} />
            </Field>
            <Field label="Flag expenses above" name="largeExpenseThreshold">
              <MoneyInput name="largeExpenseThreshold" currencySymbol={sym} defaultValue={minorToInput(p.prefs.largeExpenseThreshold)} />
            </Field>
            <input type="hidden" name="emergencyFundMonths" value={p.prefs.emergencyFundMonths} />
            <div className="flex justify-end sm:col-span-2">
              <SubmitButton>
                Save & continue <ArrowRight className="size-4" />
              </SubmitButton>
            </div>
          </ActionForm>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <StepTitle title="Add your accounts and opening balances" text="Bank, cash, wallets, credit cards and brokerage accounts. Enter today's balance — only the last 4 digits of any account number are stored." />
            {p.accounts.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {p.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <span>
                      {a.name} <span className="text-muted">· {a.type}</span>
                    </span>
                    <span className="num font-medium">{a.balance}</span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={saveAccount} resetOnSuccess className="grid gap-4 rounded-lg bg-surface-2 p-4 sm:grid-cols-2">
              <Field label="Account name" name="name">
                <Input name="name" placeholder="e.g. Salary account" />
              </Field>
              <Field label="Type" name="type">
                <Select name="type" defaultValue="SAVINGS">
                  <option value="SAVINGS">Savings account</option>
                  <option value="CURRENT">Current account</option>
                  <option value="CASH">Cash</option>
                  <option value="WALLET">Digital wallet / UPI</option>
                  <option value="CREDIT_CARD">Credit card</option>
                  <option value="INVESTMENT">Investment / brokerage</option>
                  <option value="FOREIGN_CURRENCY">Foreign currency account</option>
                </Select>
              </Field>
              <Field label="Institution" name="institution">
                <Input name="institution" placeholder="Bank or provider" />
              </Field>
              <Field label="Balance today" name="openingBalance" hint="For credit cards, enter the amount you owe">
                <MoneyInput name="openingBalance" currencySymbol={sym} />
              </Field>
              <Field label="Last 4 digits (optional)" name="maskedNumber">
                <Input name="maskedNumber" inputMode="numeric" maxLength={4} />
              </Field>
              <Field label="Currency" name="currency">
                <Input name="currency" defaultValue={p.prefs.baseCurrency} maxLength={3} />
              </Field>
              <input type="hidden" name="openingDate" value={p.today} />
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton variant="secondary">Add account</SubmitButton>
              </div>
            </ActionForm>
            <Nav onBack={() => setStep(0)} onNext={next} />
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4">
            <StepTitle title="Categories" text="A complete Indian-household category set with subcategories is ready. Untick any you'll never use (they're archived, not deleted), or add your own." />
            {(["EXPENSE", "INCOME"] as const).map((kind) => (
              <div key={kind}>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted">{kind === "EXPENSE" ? "Expenses" : "Income"}</p>
                <div className="flex flex-wrap gap-2">
                  {p.categories
                    .filter((c) => c.kind === kind)
                    .map((c) => (
                      <CategoryChip key={c.id} c={c} />
                    ))}
                </div>
              </div>
            ))}
            <ActionForm action={saveCategory} resetOnSuccess className="grid gap-3 rounded-lg bg-surface-2 p-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
              <Field label="New category" name="name">
                <Input name="name" placeholder="e.g. Pets" />
              </Field>
              <Field label="Type" name="kind">
                <Select name="kind" defaultValue="EXPENSE">
                  <option value="EXPENSE">Expense</option>
                  <option value="INCOME">Income</option>
                </Select>
              </Field>
              <input type="hidden" name="color" value="#6366f1" />
              <SubmitButton variant="secondary">Add</SubmitButton>
            </ActionForm>
            <Nav onBack={() => setStep(1)} onNext={next} />
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <StepTitle title="Regular income" text="Add your salary or other recurring income. With auto-post on, each payday is recorded automatically (you'll get a notification)." />
            {p.accounts.length === 0 ? (
              <p className="text-[13px] text-fg-2">Add an account first to receive income into.</p>
            ) : (
              <ActionForm action={saveRule} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="kind" value="INCOME" />
                <input type="hidden" name="txType" value="INCOME" />
                <input type="hidden" name="interval" value="1" />
                <input type="hidden" name="reminderDays" value="0" />
                <input type="hidden" name="categoryId" value={p.incomeCategoryId ?? ""} />
                <Field label="Name" name="name">
                  <Input name="name" defaultValue="Salary" />
                </Field>
                <Field label="Net amount per payday" name="amount">
                  <MoneyInput name="amount" currencySymbol={sym} />
                </Field>
                <Field label="Paid into" name="accountId">
                  <Select name="accountId">
                    {p.accounts
                      .filter((a) => a.rawType !== "CREDIT_CARD" && a.rawType !== "LOAN")
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Frequency" name="frequency">
                  <Select name="frequency" defaultValue="MONTHLY">
                    <option value="MONTHLY">Monthly</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="QUARTERLY">Quarterly</option>
                  </Select>
                </Field>
                <Field label="Next payday" name="startDate">
                  <Input name="startDate" type="date" defaultValue={addMonths(p.today.slice(0, 8) + "01", 1)} />
                </Field>
                <Field label="Payer" name="merchant">
                  <Input name="merchant" placeholder="Employer name" />
                </Field>
                <Checkbox name="autoPost" label="Record automatically on each payday" defaultChecked />
                <div className="flex justify-end sm:col-span-2">
                  <SubmitButton variant="secondary">Add income</SubmitButton>
                </div>
              </ActionForm>
            )}
            {p.counts.rules > 0 && <Badge tone="pos">{p.counts.rules} recurring item(s) set up</Badge>}
            <Nav onBack={() => setStep(2)} onNext={next} />
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-5">
            <StepTitle title="Assets & liabilities" text="Property, vehicles and money owed. Add loans with EMIs and investments from their own modules after setup — that keeps amortization and returns accurate." />
            <div className="grid gap-4 lg:grid-cols-2">
              <ActionForm action={saveAsset} resetOnSuccess className="grid gap-3 rounded-lg bg-surface-2 p-4">
                <p className="text-[13px] font-semibold">Add an asset</p>
                <Field label="Name" name="name">
                  <Input name="name" placeholder="e.g. Apartment" />
                </Field>
                <Field label="Type" name="type">
                  <Select name="type">
                    {Object.entries(MANUAL_ASSET_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Current value" name="currentValue">
                  <MoneyInput name="currentValue" currencySymbol={sym} />
                </Field>
                <input type="hidden" name="valuationDate" value={p.today} />
                <input type="hidden" name="currency" value={p.prefs.baseCurrency} />
                <SubmitButton variant="secondary">Add asset</SubmitButton>
              </ActionForm>
              <ActionForm action={saveLiability} resetOnSuccess className="grid gap-3 rounded-lg bg-surface-2 p-4">
                <p className="text-[13px] font-semibold">Add other debt</p>
                <Field label="Name" name="name">
                  <Input name="name" placeholder="e.g. Loan from a friend" />
                </Field>
                <Field label="Type" name="type">
                  <Select name="type">
                    {Object.entries(MANUAL_LIABILITY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Outstanding" name="outstanding">
                  <MoneyInput name="outstanding" currencySymbol={sym} />
                </Field>
                <input type="hidden" name="asOfDate" value={p.today} />
                <input type="hidden" name="currency" value={p.prefs.baseCurrency} />
                <SubmitButton variant="secondary">Add debt</SubmitButton>
              </ActionForm>
            </div>
            <p className="text-[12.5px] text-muted">
              Added so far: {p.counts.assets} asset(s), {p.counts.liabilities} liabilit{p.counts.liabilities === 1 ? "y" : "ies"}.
            </p>
            <Nav onBack={() => setStep(3)} onNext={next} />
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-4">
            <StepTitle title="Financial goals" text="Emergency fund, a house, a trip, retirement… progress and required monthly savings are calculated for you." />
            <ActionForm action={saveGoal} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
              <Field label="Goal" name="name">
                <Input name="name" placeholder="e.g. Emergency fund" />
              </Field>
              <Field label="Type" name="type">
                <Select name="type" defaultValue="EMERGENCY_FUND">
                  {Object.entries(GOAL_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Target amount" name="targetAmount">
                <MoneyInput name="targetAmount" currencySymbol={sym} />
              </Field>
              <Field label="Target date" name="targetDate">
                <Input name="targetDate" type="date" />
              </Field>
              <Field label="Saved so far" name="startingAmount">
                <MoneyInput name="startingAmount" currencySymbol={sym} />
              </Field>
              <Field label="Monthly contribution" name="monthlyContribution">
                <MoneyInput name="monthlyContribution" currencySymbol={sym} />
              </Field>
              <input type="hidden" name="priority" value="2" />
              <input type="hidden" name="trackingMode" value="MANUAL" />
              <div className="flex justify-end sm:col-span-2">
                <SubmitButton variant="secondary">Add goal</SubmitButton>
              </div>
            </ActionForm>
            {p.counts.goals > 0 && <Badge tone="pos">{p.counts.goals} goal(s) added</Badge>}
            <div className="flex items-center justify-between border-t border-line pt-4">
              <button className={btnClass("ghost")} onClick={() => setStep(4)}>
                <ArrowLeft className="size-4" /> Back
              </button>
              <button className={btnClass("primary")} onClick={finish} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />} Finish setup
              </button>
            </div>
          </div>
        )}
      </Card>
      {step < 5 && (
        <p className="mt-4 text-center text-[12.5px] text-muted">
          <button className="underline hover:text-fg" onClick={finish}>
            Skip setup and go to the dashboard
          </button>
        </p>
      )}
    </div>
  );
}

function StepTitle({ title, text }: { title: string; text: string }) {
  return (
    <div className="sm:col-span-2">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="mt-0.5 text-[13px] text-fg-2">{text}</p>
    </div>
  );
}

function Nav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-line pt-4">
      <button className={btnClass("ghost")} onClick={onBack}>
        <ArrowLeft className="size-4" /> Back
      </button>
      <button className={btnClass("primary")} onClick={onNext}>
        Continue <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

function CategoryChip({ c }: { c: { id: string; name: string; archived: boolean; color: string } }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await archiveCategory(c.id, !c.archived);
          router.refresh();
        })
      }
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] transition-colors",
        c.archived ? "border-line text-muted line-through" : "border-line-strong bg-surface text-fg",
      )}
      aria-pressed={!c.archived}
    >
      <span className="size-2 rounded-full" style={{ background: c.color }} />
      {c.name}
      {!c.archived && <Check className="size-3 text-pos" />}
    </button>
  );
}
