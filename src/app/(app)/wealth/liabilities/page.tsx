import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { MANUAL_LIABILITY_LABELS, MANUAL_LIABILITY_TYPES } from "@/lib/finance/networth";
import { LOAN_TYPE_LABELS } from "@/lib/finance/loans";
import { formatDate, formatMoney, minorToInput } from "@/lib/format";
import { Badge, Card, CardHeader, LinkButton, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction, ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { deleteLiability, saveLiability } from "../actions";

export const metadata = { title: "Liabilities" };

export default async function LiabilitiesPage() {
  const ctx = await pageCtx();
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const sym = ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency;
  const cards = ctx.accounts.filter((a) => a.type === "CREDIT_CARD");

  const LiabFields = ({ l }: { l?: (typeof ctx.liabilities)[number] }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {l && <input type="hidden" name="id" value={l.id} />}
      <Field label="Name" name="name">
        <Input name="name" defaultValue={l?.name ?? ""} />
      </Field>
      <Field label="Type" name="type">
        <Select name="type" defaultValue={l?.type ?? "PERSONAL_DEBT"}>
          {MANUAL_LIABILITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {MANUAL_LIABILITY_LABELS[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Outstanding" name="outstanding">
        <MoneyInput name="outstanding" currencySymbol={sym} defaultValue={l ? minorToInput(l.outstanding) : ""} />
      </Field>
      <Field label="As of" name="asOfDate">
        <Input name="asOfDate" type="date" defaultValue={l?.asOfDate ?? ctx.today} />
      </Field>
      <Field label="Interest rate (% p.a.)" name="interestRate">
        <Input name="interestRate" inputMode="decimal" defaultValue={l?.interestRate ?? ""} />
      </Field>
      <Field label="Currency" name="currency">
        <Input name="currency" defaultValue={l?.currency ?? ctx.prefs.baseCurrency} maxLength={3} />
      </Field>
      <Field label="Notes" name="notes" className="sm:col-span-2">
        <Textarea name="notes" rows={2} defaultValue={l?.notes ?? ""} />
      </Field>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Liabilities"
        description="Loans (with EMIs), credit card dues and other debts."
        actions={
          <>
            <LinkButton href="/wealth/loans">Manage loans</LinkButton>
            <ModalForm trigger={<><Plus className="size-4" /> Other debt</>} triggerVariant="primary" title="Add other debt" description="For debts without an EMI schedule. Use Loans for home/vehicle/personal loans." action={saveLiability} size="lg">
              <LiabFields />
            </ModalForm>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total liabilities" value={f(ctx.netWorth.totalLiabilities)} />
        <Stat label="Loans" value={f(ctx.netWorth.byGroup.LOANS)} />
        <Stat label="Credit cards" value={f(ctx.netWorth.byGroup.CREDIT_CARDS)} />
        <Stat label="Other debts" value={f(ctx.netWorth.byGroup.OTHER_LIABILITIES)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Loans" />
          <ul className="divide-y divide-line">
            {ctx.loans.map((l) => (
              <li key={l.id}>
                <Link href={`/wealth/loans/${l.id}`} className="flex justify-between px-5 py-2.5 text-[13px] hover:bg-surface-2/60">
                  <span>
                    <span className="font-medium">{l.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {LOAN_TYPE_LABELS[l.loanType]} · {l.interestRate}% · EMI {f(l.emi)}
                    </span>
                  </span>
                  <span className="num">{f(l.outstanding)}</span>
                </Link>
              </li>
            ))}
            {!ctx.loans.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No loans.</li>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Credit cards" />
          <ul className="divide-y divide-line">
            {cards.map((a) => {
              const owed = Math.max(0, -(ctx.balances.get(a.id) ?? 0));
              return (
                <li key={a.id}>
                  <Link href={`/accounts/${a.id}`} className="flex justify-between px-5 py-2.5 text-[13px] hover:bg-surface-2/60">
                    <span className="font-medium">{a.name}</span>
                    <span className="num">{formatMoney(owed, { ...ctx.fmt, currency: a.currency })}</span>
                  </Link>
                </li>
              );
            })}
            {!cards.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No credit cards.</li>}
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Other debts" />
          <Table>
            <thead>
              <tr>
                <Th>Debt</Th>
                <Th align="right">Outstanding</Th>
                <Th align="right">Rate</Th>
                <Th>As of</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {ctx.liabilities.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <span className="font-medium">{l.name}</span> {l.isDemo && <Badge tone="warn">Demo</Badge>}
                    <div className="text-[11.5px] text-muted">{MANUAL_LIABILITY_LABELS[l.type]}</div>
                  </Td>
                  <Td align="right">{formatMoney(l.outstanding, { ...ctx.fmt, currency: l.currency })}</Td>
                  <Td align="right">{l.interestRate ? `${l.interestRate}%` : "—"}</Td>
                  <Td className="text-fg-2">{formatDate(l.asOfDate, ctx.fmt)}</Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1">
                      <ModalForm trigger={<Pencil className="size-3.5" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-8" title={`Edit ${l.name}`} action={saveLiability} size="lg" resetOnSuccess={false}>
                        <LiabFields l={l} />
                      </ModalForm>
                      <ConfirmAction action={deleteLiability.bind(null, l.id)} title={`Delete ${l.name}?`} size="icon" className="size-8">
                        <Trash2 className="size-3.5" />
                      </ConfirmAction>
                    </div>
                  </Td>
                </tr>
              ))}
              {!ctx.liabilities.length && (
                <tr>
                  <Td colSpan={5} className="py-6 text-center text-muted">
                    No other debts.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
