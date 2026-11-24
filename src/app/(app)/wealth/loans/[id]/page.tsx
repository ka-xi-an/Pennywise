import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { txFormOptions } from "@/lib/server/options";
import { amortize, LOAN_TYPE_LABELS, nextEmiDate, remainingTenure } from "@/lib/finance/loans";
import { formatDate, formatMoney, minorToInput } from "@/lib/format";
import { Badge, Card, CardHeader, KV, PageHeader, Stat, Table, Td, Th } from "@/components/ui/core";
import { ConfirmAction, ModalForm } from "@/components/ui/modal";
import { Field, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { ChartFrame, TrendChart } from "@/components/charts";
import { TxList } from "@/components/tx-list";
import { deleteLoan, updateLoan } from "../../actions";
import { PrepaymentSimulator } from "./prepayment";
import { RecordPayment } from "./record-payment";

export default async function LoanDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageCtx();
  const l = ctx.loans.find((x) => x.id === id);
  if (!l) notFound();
  const fmt = { ...ctx.fmt, currency: l.currency };
  const f = (v: number) => formatMoney(v, fmt);
  const first = nextEmiDate(ctx.today, l.emiDay);
  const rate = Number(l.interestRate);
  const sched = amortize(l.outstanding, rate, l.emi, first);
  const payments = ctx.txsNative.filter((t) => t.toAccountId === l.accountId || t.accountId === l.accountId);
  const repayments = payments.filter((t) => t.type === "LOAN_REPAYMENT");
  const paidInterest = repayments.reduce((s, t) => s + (t.interestAmount ?? 0), 0);
  const paidPrincipal = repayments.reduce((s, t) => s + (t.principalAmount ?? 0), 0);
  const options = await txFormOptions(ctx);
  const yearly = sched.rows.filter((_, i) => i % 12 === 11 || i === sched.rows.length - 1).map((r) => ({ x: r.date, balance: r.closing }));

  return (
    <>
      <Link href="/wealth/loans" className="mb-3 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-fg">
        <ArrowLeft className="size-3.5" /> Loans
      </Link>
      <PageHeader
        eyebrow={`${LOAN_TYPE_LABELS[l.loanType]} · ${l.lender ?? ""}`}
        title={
          <span className="flex items-center gap-2">
            {l.name} {l.isDemo && <Badge tone="warn">Demo</Badge>} {l.status !== "ACTIVE" && <Badge>Closed</Badge>}
          </span>
        }
        actions={
          <>
            <RecordPayment options={options} initial={{ type: "LOAN_REPAYMENT", loanId: l.id, amount: minorToInput(l.emi, l.currency), date: ctx.today }} />
            <ModalForm trigger={<><Pencil className="size-4" /> Edit</>} title="Edit loan" description="Rate or EMI changes apply to projections from today. Existing payments are unchanged." action={updateLoan} resetOnSuccess={false}>
              <input type="hidden" name="id" value={l.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" name="name">
                  <Input name="name" defaultValue={l.name} />
                </Field>
                <Field label="Lender" name="lender">
                  <Input name="lender" defaultValue={l.lender ?? ""} />
                </Field>
                <Field label="Interest rate (% p.a.)" name="interestRate">
                  <Input name="interestRate" defaultValue={l.interestRate} inputMode="decimal" />
                </Field>
                <Field label="EMI" name="emi">
                  <MoneyInput name="emi" currencySymbol={l.currency === "INR" ? "₹" : l.currency} defaultValue={minorToInput(l.emi, l.currency)} />
                </Field>
                <Field label="EMI day" name="emiDay">
                  <Input name="emiDay" type="number" min={1} max={28} defaultValue={l.emiDay} />
                </Field>
                <Field label="Original tenure (months)" name="tenureMonths">
                  <Input name="tenureMonths" type="number" defaultValue={l.tenureMonths} />
                </Field>
                <Field label="Status" name="status">
                  <Select name="status" defaultValue={l.status}>
                    <option value="ACTIVE">Active</option>
                    <option value="CLOSED">Closed</option>
                  </Select>
                </Field>
                <Field label="Notes" name="notes" className="sm:col-span-2">
                  <Textarea name="notes" rows={2} />
                </Field>
              </div>
            </ModalForm>
            <ConfirmAction action={deleteLoan.bind(null, l.id)} title={`Delete ${l.name}?`} description={`Deletes the loan, its account, EMI schedule and ${payments.length} related transaction(s). Bank-side debits of those payments are removed too.`} requireText="DELETE" variant="secondary" size="icon">
              <Trash2 className="size-4" />
            </ConfirmAction>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label="Outstanding" value={f(l.outstanding)} />
        <Stat label="EMI" value={f(l.emi)} hint={`on day ${l.emiDay}`} />
        <Stat label="Remaining" value={`${sched.months} mo`} hint={sched.payoffDate ? `until ${formatDate(sched.payoffDate, ctx.fmt)}` : "never at this EMI"} />
        <Stat label="Interest payable" value={f(sched.totalInterest)} tooltip="Remaining interest from the amortization schedule." />
        <Stat label="Principal repaid" value={f(paidPrincipal)} hint="recorded payments" />
        <Stat label="Interest paid" value={f(paidInterest)} hint="recorded payments" />
      </div>
      {sched.negativeAmortization && (
        <Card className="mb-4 border-neg/40 p-4 text-[13px] text-neg">The EMI does not cover the monthly interest — the balance will never reduce. Check the rate and EMI.</Card>
      )}
      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PrepaymentSimulator outstanding={l.outstanding} rate={rate} emi={l.emi} firstDate={first} prefs={fmt} />
        </div>
        <div className="lg:col-span-5">
          <ChartFrame title="Payoff projection" subtitle="Outstanding at each year-end (current EMI & rate)" table={{ columns: ["Date", "Balance"], rows: yearly.map((y) => [formatDate(y.x, ctx.fmt), f(y.balance)]) }}>
            <TrendChart prefs={fmt} xKey="x" data={[{ x: ctx.today, balance: l.outstanding }, ...yearly]} series={[{ key: "balance", name: "Outstanding", slot: 1 }]} xFormat="year" height={220} />
          </ChartFrame>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader title="Amortization schedule" subtitle={`${sched.rows.length} remaining instalments from ${formatDate(first, ctx.fmt)}`} />
          <div className="thin-scroll max-h-[480px] overflow-y-auto">
            <Table>
              <thead className="sticky top-0">
                <tr>
                  <Th>#</Th>
                  <Th>Date</Th>
                  <Th align="right">Opening</Th>
                  <Th align="right">EMI</Th>
                  <Th align="right">Interest</Th>
                  <Th align="right">Principal</Th>
                  <Th align="right">Closing</Th>
                </tr>
              </thead>
              <tbody>
                {sched.rows.map((r) => (
                  <tr key={r.n}>
                    <Td className="text-muted">{r.n}</Td>
                    <Td className="num">{formatDate(r.date, ctx.fmt)}</Td>
                    <Td align="right">{f(r.opening)}</Td>
                    <Td align="right">{f(r.payment)}</Td>
                    <Td align="right" className="text-fg-2">{f(r.interest)}</Td>
                    <Td align="right">{f(r.principal)}</Td>
                    <Td align="right">{f(r.closing)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader title="Loan terms" />
            <div className="divide-y divide-line px-5 pb-4">
              <KV k="Sanctioned" v={f(l.principal)} />
              <KV k="Rate" v={`${l.interestRate}% p.a. (monthly reducing)`} />
              <KV k="Original tenure" v={`${l.tenureMonths} months`} />
              <KV k="Started" v={formatDate(l.startDate, ctx.fmt)} />
              <KV k="Tenure at current EMI" v={`${remainingTenure(l.outstanding, rate, l.emi) ?? "∞"} months`} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Payments & disbursements" />
            <TxList ctx={ctx} txs={payments.slice(0, 12)} empty="No payments recorded." />
          </Card>
        </div>
      </div>
    </>
  );
}
