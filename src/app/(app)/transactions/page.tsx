import Link from "next/link";
import { Suspense } from "react";
import { Download, Upload, Repeat } from "lucide-react";
import { pageCtx, type SP } from "@/lib/server/page";
import { queryTransactions, readFilters } from "@/lib/server/tx-query";
import { txView } from "@/lib/server/display";
import { categoryLabel, accountName } from "@/lib/server/data";
import { expenseOf, incomeOf } from "@/lib/finance/ledger";
import { TX_TYPE_LABELS, TX_TYPES, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/finance/types";
import { formatDate, formatMoney } from "@/lib/format";
import { db } from "@/lib/server/db";
import { Card, LinkButton, PageHeader, Tabs } from "@/components/ui/core";
import { TxFilterBar } from "./filter-bar";
import { TxTable } from "./tx-table";
import { QuickAddButton } from "../dashboard/quick-add-button";

export const metadata = { title: "Transactions" };
const PAGE_SIZE = 50;

export default async function TransactionsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const f = readFilters(sp);
  const { rows, range } = await queryTransactions(ctx, f);
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const tags = await db.tag.findMany({ where: { userId: ctx.userId }, orderBy: { name: "asc" } });
  const income = rows.reduce((s, t) => s + (t.currency === ctx.prefs.baseCurrency ? incomeOf(t) : 0), 0);
  const expenses = rows.reduce((s, t) => s + (t.currency === ctx.prefs.baseCurrency ? expenseOf(t) : 0), 0);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
  const tabQs = (type?: string) => {
    const q = new URLSearchParams(qs);
    q.delete("page");
    if (type) q.set("type", type);
    else q.delete("type");
    return `/transactions?${q.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every movement of money in one ledger. Transfers and investment purchases never count as spending."
        actions={
          <>
            <LinkButton href={`/api/export/transactions?${qs.toString()}`} prefetch={false}>
              <Download className="size-4" /> Export CSV
            </LinkButton>
            <LinkButton href="/import">
              <Upload className="size-4" /> Import
            </LinkButton>
            <LinkButton href="/recurring">
              <Repeat className="size-4" /> Recurring
            </LinkButton>
            <QuickAddButton label="New transaction" />
          </>
        }
      />
      <Tabs
        active={f.type ?? "all"}
        items={[
          { id: "all", label: "All", href: tabQs() },
          { id: "INCOME,DIVIDEND,INTEREST", label: "Income", href: tabQs("INCOME,DIVIDEND,INTEREST") },
          { id: "EXPENSE,REFUND,LOAN_REPAYMENT", label: "Expenses", href: tabQs("EXPENSE,REFUND,LOAN_REPAYMENT") },
          { id: "TRANSFER", label: "Transfers", href: tabQs("TRANSFER") },
          { id: "INVESTMENT_BUY,INVESTMENT_SELL", label: "Investments", href: tabQs("INVESTMENT_BUY,INVESTMENT_SELL") },
          { id: "LOAN_REPAYMENT,LOAN_DISBURSEMENT", label: "Loans", href: tabQs("LOAN_REPAYMENT,LOAN_DISBURSEMENT") },
        ]}
      />
      <Suspense>
        <TxFilterBar
          filters={f}
          range={range}
          accounts={ctx.accounts.map((a) => ({ value: a.id, label: a.name }))}
          categories={ctx.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: categoryLabel(ctx, c.id), kind: c.kind }))}
          tags={tags.map((t) => t.name)}
          types={TX_TYPES.map((t) => ({ value: t, label: TX_TYPE_LABELS[t] }))}
          methods={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
        />
      </Suspense>
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-fg-2">
        <span>
          <span className="font-semibold text-fg">{rows.length.toLocaleString("en-IN")}</span> transactions
        </span>
        <span>
          Income <span className="num font-semibold text-pos">{formatMoney(income, ctx.fmt)}</span>
        </span>
        <span>
          Expenses <span className="num font-semibold text-fg">{formatMoney(expenses, ctx.fmt)}</span>
        </span>
        <span className="text-muted">
          {formatDate(range.from, ctx.fmt)} – {formatDate(range.to, ctx.fmt)}
        </span>
      </div>
      <Card>
        <TxTable
          rows={slice.map((t) => {
            const v = txView(ctx, t);
            return {
              id: t.id,
              date: formatDate(t.date, ctx.fmt),
              title: v.title,
              subtitle: t.description && t.description !== v.title ? t.description : "",
              type: TX_TYPE_LABELS[t.type],
              category: ["TRANSFER", "INVESTMENT_BUY", "INVESTMENT_SELL", "LOAN_DISBURSEMENT", "ADJUSTMENT"].includes(t.type) ? "—" : categoryLabel(ctx, t.categoryId),
              account: t.toAccountId ? `${accountName(ctx, t.accountId)} → ${accountName(ctx, t.toAccountId)}` : accountName(ctx, t.accountId),
              method: t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? t.paymentMethod : "",
              amountText: v.amountText,
              tone: v.tone,
              isDemo: t.isDemo,
            };
          })}
          categories={ctx.categories.filter((c) => !c.archived).map((c) => ({ value: c.id, label: categoryLabel(ctx, c.id), kind: c.kind }))}
          methods={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
          sort={f.sort ?? "date"}
          dir={f.dir ?? "desc"}
          emptyHasFilters={Object.entries(f).some(([k, v]) => v && !["range", "sort", "dir"].includes(k)) || f.range !== "all"}
        />
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[12.5px]">
            <span className="text-muted">
              Page {page} of {pages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={`/transactions?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page - 1) })}`}>
                  Previous
                </Link>
              )}
              {page < pages && (
                <Link className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={`/transactions?${new URLSearchParams({ ...Object.fromEntries(qs), page: String(page + 1) })}`}>
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
