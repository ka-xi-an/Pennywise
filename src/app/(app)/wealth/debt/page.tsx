import Link from "next/link";
import { pageCtx } from "@/lib/server/page";
import { keyMetrics } from "@/lib/server/data";
import { amortize, nextEmiDate } from "@/lib/finance/loans";
import { formatMoney, formatPct } from "@/lib/format";
import { Badge, Card, CardHeader, Notice, PageHeader, ProgressBar, Stat, Table, Td, Th } from "@/components/ui/core";

export const metadata = { title: "Debt management" };

interface Debt {
  name: string;
  href: string;
  kind: string;
  balance: number;
  rate: number | null;
  monthly: number | null;
  payoff: string | null;
  interestLeft: number | null;
}

export default async function DebtPage() {
  const ctx = await pageCtx();
  const m = keyMetrics(ctx);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const debts: Debt[] = [
    ...ctx.loans
      .filter((l) => l.outstanding > 0)
      .map((l) => {
        const s = amortize(l.outstanding, Number(l.interestRate), l.emi, nextEmiDate(ctx.today, l.emiDay));
        return { name: l.name, href: `/wealth/loans/${l.id}`, kind: "Loan", balance: l.outstanding, rate: Number(l.interestRate), monthly: l.emi, payoff: s.payoffDate, interestLeft: s.totalInterest };
      }),
    ...ctx.accounts
      .filter((a) => a.type === "CREDIT_CARD" && (ctx.balances.get(a.id) ?? 0) < 0)
      .map((a) => ({ name: a.name, href: `/accounts/${a.id}`, kind: "Credit card", balance: -(ctx.balances.get(a.id) ?? 0), rate: null, monthly: null, payoff: null, interestLeft: null })),
    ...ctx.liabilities.map((l) => ({ name: l.name, href: "/wealth/liabilities", kind: "Other", balance: l.outstanding, rate: l.interestRate ? Number(l.interestRate) : null, monthly: null, payoff: null, interestLeft: null })),
  ];
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const avalanche = [...debts].sort((a, b) => (b.rate ?? 36) - (a.rate ?? 36));
  const snowball = [...debts].sort((a, b) => a.balance - b.balance);

  return (
    <>
      <PageHeader title="Debt management" description="All debt in one place, with ratios lenders look at and two classic payoff orders." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total debt" value={f(total)} />
        <Stat label="Monthly EMIs" value={f(m.monthlyDebtPayments)} />
        <Stat label="Debt-to-income" value={formatPct(m.debtToIncome)} tooltip="Monthly EMIs ÷ average monthly income (last complete months). Many lenders prefer under 40%." hint={m.basis} />
        <Stat label="Debt-to-asset" value={formatPct(ctx.netWorth.debtToAsset)} />
        <Stat label="Credit utilization" value={formatPct(m.creditUtilization)} tooltip="Card balances ÷ card limits. Under 30% is generally healthy." />
      </div>
      {m.creditUtilization != null && <ProgressBar value={m.creditUtilization} className="mb-4" label="Credit utilization" />}
      <Card className="mb-4">
        <CardHeader title="Debts" />
        <Table>
          <thead>
            <tr>
              <Th>Debt</Th>
              <Th align="right">Balance</Th>
              <Th align="right">Rate</Th>
              <Th align="right">Monthly</Th>
              <Th align="right">Interest left</Th>
              <Th align="right">Payoff</Th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.href + d.name}>
                <Td>
                  <Link href={d.href} className="font-medium hover:underline">
                    {d.name}
                  </Link>{" "}
                  <Badge>{d.kind}</Badge>
                </Td>
                <Td align="right">{f(d.balance)}</Td>
                <Td align="right">{d.rate != null ? `${d.rate}%` : "—"}</Td>
                <Td align="right">{d.monthly != null ? f(d.monthly) : "—"}</Td>
                <Td align="right">{d.interestLeft != null ? f(d.interestLeft) : "—"}</Td>
                <Td align="right">{d.payoff ?? "—"}</Td>
              </tr>
            ))}
            {!debts.length && (
              <tr>
                <Td colSpan={6} className="py-8 text-center text-pos">
                  Debt-free. 🎉
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
      {debts.length > 1 && (
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { title: "Avalanche (highest rate first)", text: "Minimises total interest paid.", list: avalanche },
            { title: "Snowball (smallest balance first)", text: "Clears accounts fastest for motivation.", list: snowball },
          ].map((s) => (
            <Card key={s.title}>
              <CardHeader title={s.title} subtitle={s.text} />
              <ol className="space-y-1.5 px-5 pb-5 text-[13px]">
                {s.list.map((d, i) => (
                  <li key={d.name} className="flex justify-between">
                    <span>
                      {i + 1}. {d.name}
                    </span>
                    <span className="num text-fg-2">
                      {f(d.balance)} {d.rate != null && `· ${d.rate}%`}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
      <Notice className="mt-4">Credit-card interest rates aren&apos;t stored, so cards are treated as high-rate (~36% p.a.) in the avalanche order. Pay statement balances in full to avoid interest.</Notice>
    </>
  );
}
