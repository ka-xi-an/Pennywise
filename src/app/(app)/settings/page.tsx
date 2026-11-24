import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { formatDate, minorToInput } from "@/lib/format";
import { Card, CardHeader, Notice, PageHeader, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction, ModalForm } from "@/components/ui/modal";
import { ActionForm, Field, Input, MoneyInput, Select, SubmitButton } from "@/components/ui/form";
import { deleteFxRate, saveFxRate, savePreferences, saveProfile } from "./actions";
import { SettingsTabs } from "./settings-tabs";

export const metadata = { title: "Settings" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default async function SettingsPage() {
  const user = await requireUser();
  const ctx = await pageCtx();
  const p = ctx.prefs;
  const rates = await db.fxRate.findMany({ where: { userId: ctx.userId }, orderBy: [{ fromCurrency: "asc" }, { date: "desc" }] });
  const foreign = [...new Set(ctx.accounts.map((a) => a.currency).filter((c) => c !== p.baseCurrency))];
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs active="general" />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <Card>
            <CardHeader title="Profile" />
            <ActionForm action={saveProfile} className="grid gap-4 px-5 pb-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Name" name="name">
                <Input name="name" defaultValue={user.name} />
              </Field>
              <SubmitButton variant="secondary">Save</SubmitButton>
              <p className="text-[12.5px] text-muted sm:col-span-2">Email: {user.email}</p>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Preferences" subtitle="Currency, number format, financial year and dates" />
            <ActionForm action={savePreferences} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <Field label="Base currency" name="baseCurrency" hint="All totals are shown in this currency">
                <Select name="baseCurrency" defaultValue={p.baseCurrency}>
                  {["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Locale (number format)" name="locale">
                <Select name="locale" defaultValue={p.locale}>
                  <option value="en-IN">English (India) — 1,23,456.00 · lakh/crore</option>
                  <option value="en-US">English (US) — 123,456.00</option>
                  <option value="en-GB">English (UK) — 123,456.00</option>
                  <option value="de-DE">German — 123.456,00</option>
                  <option value="fr-FR">French — 123 456,00</option>
                </Select>
              </Field>
              <Field label="Financial year starts" name="fyStartMonth">
                <Select name="fyStartMonth" defaultValue={String(p.fyStartMonth)}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date format" name="dateFormat">
                <Select name="dateFormat" defaultValue={p.dateFormat}>
                  <option>DD/MM/YYYY</option>
                  <option>MM/DD/YYYY</option>
                  <option>YYYY-MM-DD</option>
                  <option>DD MMM YYYY</option>
                </Select>
              </Field>
              <Field label="Timezone" name="timezone" hint="Determines what “today” is">
                <Input name="timezone" defaultValue={p.timezone} />
              </Field>
              <Field label="Large-expense alert above" name="largeExpenseThreshold">
                <MoneyInput name="largeExpenseThreshold" currencySymbol={p.baseCurrency === "INR" ? "₹" : p.baseCurrency} defaultValue={minorToInput(p.largeExpenseThreshold)} />
              </Field>
              <Field label="Emergency fund target (months)" name="emergencyFundMonths">
                <Input name="emergencyFundMonths" type="number" min={1} max={24} defaultValue={p.emergencyFundMonths} />
              </Field>
              <div className="flex items-end justify-end">
                <SubmitButton>Save preferences</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
        <div className="space-y-4 lg:col-span-5">
          <Card id="currency">
            <CardHeader
              title="Exchange rates"
              subtitle="Used to convert foreign-currency accounts into your base currency. Enter rates yourself — none are fetched or assumed."
              action={
                <ModalForm trigger={<><Plus className="size-4" /> Add rate</>} triggerSize="sm" title="Add exchange rate" action={saveFxRate}>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="1 unit of" name="fromCurrency">
                      <Input name="fromCurrency" defaultValue={foreign[0] ?? "USD"} maxLength={3} className="uppercase" />
                    </Field>
                    <Field label="equals (in)" name="toCurrency">
                      <Input name="toCurrency" defaultValue={p.baseCurrency} maxLength={3} className="uppercase" />
                    </Field>
                    <Field label="Rate" name="rate">
                      <Input name="rate" inputMode="decimal" placeholder="e.g. 83.25" />
                    </Field>
                    <Field label="As of" name="date">
                      <Input name="date" type="date" defaultValue={ctx.today} />
                    </Field>
                  </div>
                </ModalForm>
              }
            />
            {foreign.length > 0 && <Notice className="mx-5 mb-3">Your accounts use: {foreign.join(", ")}. Transactions are converted with the latest rate on or before their date.</Notice>}
            <Table>
              <thead>
                <tr>
                  <Th>Pair</Th>
                  <Th align="right">Rate</Th>
                  <Th>As of</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      {r.fromCurrency} → {r.toCurrency}
                    </Td>
                    <Td align="right">{r.rate}</Td>
                    <Td className="text-fg-2">{formatDate(r.date, ctx.fmt)}</Td>
                    <Td align="right">
                      <ConfirmAction action={deleteFxRate.bind(null, r.id)} title="Remove rate?" size="icon" className="size-7">
                        <Trash2 className="size-3.5" />
                      </ConfirmAction>
                    </Td>
                  </tr>
                ))}
                {!rates.length && (
                  <tr>
                    <Td colSpan={4} className="py-6 text-center text-muted">
                      No exchange rates.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>
          <Card className="p-5 text-[13px]">
            <p className="font-medium">More settings</p>
            <ul className="mt-2 space-y-1.5 text-accent">
              <li><Link href="/categories" className="hover:underline">Categories & subcategories</Link></li>
              <li><Link href="/notifications" className="hover:underline">Notification preferences</Link></li>
              <li><Link href="/investments/analytics" className="hover:underline">Target asset allocation</Link></li>
              <li><Link href="/tax?tab=rules" className="hover:underline">Tax rules by financial year</Link></li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
