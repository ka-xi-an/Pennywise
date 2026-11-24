import Link from "next/link";
import { Landmark, Plus } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { amortize, LOAN_TYPE_LABELS, nextEmiDate } from "@/lib/finance/loans";
import { formatDate, formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, Stat } from "@/components/ui/core";
import { ModalForm } from "@/components/ui/modal";
import { LoanFields } from "@/components/loan-fields";
import { createLoan } from "../actions";

export const metadata = { title: "Loans" };

export default async function LoansPage() {
  const ctx = await pageCtx();
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const sym = ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency;
  const rows = ctx.loans.map((l) => ({ l, s: amortize(l.outstanding, Number(l.interestRate), l.emi, nextEmiDate(ctx.today, l.emiDay)) }));
  const totalOutstanding = rows.reduce((s, r) => s + r.l.outstanding, 0);
  const totalEmi = ctx.loans.filter((l) => l.status === "ACTIVE" && l.outstanding > 0).reduce((s, l) => s + l.emi, 0);
  const interestLeft = rows.reduce((s, r) => s + r.s.totalInterest, 0);
  return (
    <>
      <PageHeader
        title="Loans"
        description="Each loan is backed by a loan account, so repayments reduce the outstanding principal and net worth updates automatically."
        actions={
          <ModalForm trigger={<><Plus className="size-4" /> Add loan</>} triggerVariant="primary" title="Add loan" action={createLoan} size="lg">
            <LoanFields accounts={ctx.accounts.filter((a) => a.type !== "LOAN" && a.status === "ACTIVE").map((a) => ({ id: a.id, name: a.name }))} today={ctx.today} sym={sym} currency={ctx.prefs.baseCurrency} />
          </ModalForm>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outstanding principal" value={f(totalOutstanding)} />
        <Stat label="Monthly EMIs" value={f(totalEmi)} />
        <Stat label="Interest still payable" value={f(interestLeft)} tooltip="Total interest across remaining amortization schedules at current rates and EMIs." />
        <Stat label="Active loans" value={String(ctx.loans.filter((l) => l.status === "ACTIVE").length)} />
      </div>
      {!rows.length ? (
        <Card>
          <EmptyState icon={<Landmark className="size-5" />} title="No loans" description="Add home, vehicle, education or personal loans to get amortization schedules, EMI tracking and prepayment scenarios." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ l, s }) => {
            const paidPct = l.principal ? ((l.principal - l.outstanding) / l.principal) * 100 : null;
            return (
              <Link key={l.id} href={`/wealth/loans/${l.id}`}>
                <Card className="h-full p-5 hover:shadow-pop">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[15px] font-semibold">{l.name}</p>
                      <p className="text-[12px] text-muted">
                        {LOAN_TYPE_LABELS[l.loanType]} · {l.lender ?? "—"} · {l.interestRate}% p.a.
                      </p>
                    </div>
                    <div className="flex gap-1">
                      {l.status !== "ACTIVE" && <Badge>Closed</Badge>}
                      {l.isDemo && <Badge tone="warn">Demo</Badge>}
                      {s.negativeAmortization && <Badge tone="neg">EMI below interest</Badge>}
                    </div>
                  </div>
                  <p className="num mt-3 text-[20px] font-semibold">{f(l.outstanding)}</p>
                  <p className="text-[12px] text-muted">outstanding of {f(l.principal)} sanctioned</p>
                  <ProgressBar value={paidPct} tone="pos" className="mt-2" label="Principal repaid" />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                    <span>
                      <span className="block text-muted">EMI</span>
                      <span className="num font-medium">{f(l.emi)}</span>
                    </span>
                    <span>
                      <span className="block text-muted">Remaining</span>
                      <span className="num font-medium">{s.months} months</span>
                    </span>
                    <span>
                      <span className="block text-muted">Payoff</span>
                      <span className="num font-medium">{s.payoffDate ? formatDate(s.payoffDate, ctx.fmt) : "—"}</span>
                    </span>
                  </div>
                  <p className="mt-2 text-[11.5px] text-muted">{formatPct(paidPct, 0)} of principal repaid · {f(s.totalInterest)} interest remaining</p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
