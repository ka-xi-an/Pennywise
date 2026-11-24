import Link from "next/link";
import { ArrowLeftRight, Landmark, Plus, Scale } from "lucide-react";
import { pageCtx, param, type SP } from "@/lib/server/page";
import { balanceHistory } from "@/lib/finance/ledger";
import { addMonths, startOfMonth } from "@/lib/finance/dates";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "@/lib/finance/types";
import { formatMoney, formatPct, maskAccountNumber } from "@/lib/format";
import { Badge, Card, EmptyState, LinkButton, PageHeader, ProgressBar, Stat, Tabs, cx } from "@/components/ui/core";
import { ModalForm } from "@/components/ui/modal";
import { AccountFields } from "@/components/account-fields";
import { Sparkline } from "@/components/charts";
import { saveAccount } from "./actions";

export const metadata = { title: "Accounts" };

const GROUPS: Record<string, { label: string; types: AccountType[] }> = {
  bank: { label: "Bank accounts", types: ["SAVINGS", "CURRENT", "FOREIGN_CURRENCY"] },
  cash: { label: "Cash & wallets", types: ["CASH", "WALLET"] },
  credit: { label: "Credit cards", types: ["CREDIT_CARD"] },
  investment: { label: "Investment accounts", types: ["INVESTMENT"] },
  loan: { label: "Loan accounts", types: ["LOAN"] },
};

export default async function AccountsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const group = param(sp, "group") ?? "all";
  const sym = ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency;
  const histRange = { from: addMonths(startOfMonth(ctx.today), -11), to: ctx.today };
  const conv = (id: string) => {
    const a = ctx.accountById.get(id)!;
    return ctx.fx.convert(ctx.balances.get(id) ?? 0, a.currency, ctx.today);
  };
  const visibleGroups = Object.entries(GROUPS).filter(([k]) => group === "all" || k === group);

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Balances are always calculated from the opening balance plus every recorded transaction — they cannot drift."
        actions={
          <>
            <LinkButton href="/accounts/transfers">
              <ArrowLeftRight className="size-4" /> Transfer
            </LinkButton>
            <LinkButton href="/accounts/reconcile">
              <Scale className="size-4" /> Reconcile
            </LinkButton>
            <ModalForm trigger={<><Plus className="size-4" /> Add account</>} triggerVariant="primary" title="New account" action={saveAccount} size="lg" submitLabel="Create account">
              <AccountFields today={ctx.today} baseCurrency={ctx.prefs.baseCurrency} sym={sym} />
            </ModalForm>
          </>
        }
      />
      <Tabs
        active={group}
        items={[
          { id: "all", label: "All", href: "/accounts" },
          ...Object.entries(GROUPS).map(([k, g]) => ({ id: k, label: g.label, href: `/accounts?group=${k}`, count: ctx.accounts.filter((a) => g.types.includes(a.type)).length })),
        ]}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash & bank" value={formatMoney(ctx.netWorth.byGroup.CASH_BANK, ctx.fmt)} />
        <Stat label="Brokerage cash" value={formatMoney(ctx.netWorth.byGroup.INVESTMENT_CASH, ctx.fmt)} />
        <Stat label="Credit card dues" value={formatMoney(ctx.netWorth.byGroup.CREDIT_CARDS, ctx.fmt)} />
        <Stat label="Loan principal outstanding" value={formatMoney(ctx.netWorth.byGroup.LOANS, ctx.fmt)} />
      </div>
      {ctx.accounts.length === 0 ? (
        <Card>
          <EmptyState icon={<Landmark className="size-5" />} title="No accounts yet" description="Add your bank accounts, cash, wallets and cards with today's balances to begin." />
        </Card>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map(([k, g]) => {
            const list = ctx.accounts.filter((a) => g.types.includes(a.type));
            if (!list.length) return null;
            const total = list.reduce((s, a) => s + (conv(a.id) ?? 0), 0);
            return (
              <section key={k}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-[13px] font-semibold text-fg-2">{g.label}</h2>
                  <span className="num text-[13px] font-semibold">{formatMoney(total, ctx.fmt)}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((a) => {
                    const bal = ctx.balances.get(a.id) ?? 0;
                    const hist = balanceHistory(a, ctx.txsNative, histRange).map((p) => p.balance);
                    const used = a.type === "CREDIT_CARD" ? Math.max(0, -bal) : 0;
                    const util = a.creditLimit ? (used / a.creditLimit) * 100 : null;
                    const loan = ctx.loans.find((l) => l.accountId === a.id);
                    return (
                      <Link key={a.id} href={loan ? `/wealth/loans/${loan.id}` : `/accounts/${a.id}`} className={cx("block", a.status === "CLOSED" && "opacity-60")}>
                        <Card className="h-full p-4 transition-shadow hover:shadow-pop">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-semibold">{a.name}</p>
                              <p className="truncate text-[11.5px] text-muted">
                                {[a.institution, ACCOUNT_TYPE_LABELS[a.type], maskAccountNumber(a.maskedNumber)].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              {a.status === "CLOSED" && <Badge>Closed</Badge>}
                              {a.isDemo && <Badge tone="warn">Demo</Badge>}
                              {!a.includeInNetWorth && <Badge>Excluded</Badge>}
                              {a.currency !== ctx.prefs.baseCurrency && <Badge tone="info">{a.currency}</Badge>}
                            </div>
                          </div>
                          <p className={cx("num mt-3 text-[20px] font-semibold tracking-tight", bal < 0 && "text-neg")}>
                            {formatMoney(bal, { ...ctx.fmt, currency: a.currency })}
                          </p>
                          {a.type === "CREDIT_CARD" && <p className="text-[11.5px] text-muted">{bal < 0 ? "Outstanding" : bal > 0 ? "Credit balance" : "Paid up"}</p>}
                          {a.type === "LOAN" && <p className="text-[11.5px] text-muted">Principal outstanding</p>}
                          {a.currency !== ctx.prefs.baseCurrency && (
                            <p className="text-[11.5px] text-muted">{conv(a.id) == null ? "No exchange rate — excluded from totals" : `≈ ${formatMoney(conv(a.id)!, ctx.fmt)}`}</p>
                          )}
                          {util != null && (
                            <div className="mt-2">
                              <div className="mb-1 flex justify-between text-[11.5px] text-muted">
                                <span>Utilization {formatPct(util, 0)}</span>
                                <span>Limit {formatMoney(a.creditLimit!, { ...ctx.fmt, currency: a.currency }, { compact: true })}</span>
                              </div>
                              <ProgressBar value={util} label="Credit utilization" />
                            </div>
                          )}
                          <div className="mt-2">
                            <Sparkline values={hist} positive={a.type !== "CREDIT_CARD" && a.type !== "LOAN"} />
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {group === "loan" && (
            <p className="text-[12.5px] text-muted">
              Loans are created from{" "}
              <Link href="/wealth/loans" className="text-accent underline">
                Wealth → Loans
              </Link>{" "}
              so amortization stays accurate.
            </p>
          )}
        </div>
      )}
    </>
  );
}
