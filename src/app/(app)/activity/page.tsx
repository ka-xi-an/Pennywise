import { pageCtx } from "@/lib/server/page";
import { db } from "@/lib/server/db";
import { formatDate } from "@/lib/format";
import { Card, CardHeader, PageHeader } from "@/components/ui/core";
import { TxList } from "@/components/tx-list";

export const metadata = { title: "Recent activity" };

const ACTION_LABELS: Record<string, string> = {
  "transaction.create": "Added a transaction",
  "transaction.update": "Edited a transaction",
  "transaction.delete": "Deleted a transaction",
  "transaction.bulk_delete": "Deleted transactions in bulk",
  "transaction.bulk_categorize": "Re-categorised transactions",
  "transaction.duplicate": "Duplicated a transaction",
  "account.create": "Created an account",
  "account.update": "Edited an account",
  "account.adjust": "Adjusted an account balance",
  "account.reconcile": "Reconciled an account",
  "account.close": "Closed an account",
  "account.delete": "Deleted an account",
  "import.csv": "Imported a CSV",
  "import.undo": "Undid an import",
  "loan.create": "Added a loan",
  "goal.create": "Created a goal",
  "budget.create": "Created a budget",
  "holding.create": "Added a holding",
  "investment_tx.create": "Recorded an investment transaction",
  "auth.login": "Signed in",
  "auth.password_change": "Changed password",
  "export.transactions": "Exported transactions",
  "backup.export": "Downloaded a backup",
  "backup.restore": "Restored a backup",
  "demo.load": "Loaded demo data",
  "demo.remove": "Removed demo data",
};

export default async function ActivityPage() {
  const ctx = await pageCtx();
  const [recent, log] = await Promise.all([
    db.transaction.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true } }),
    db.auditLog.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const ids = new Set(recent.map((r) => r.id));
  const recentTx = ctx.txsNative.filter((t) => ids.has(t.id));
  return (
    <>
      <PageHeader title="Recent activity" description="Your latest transactions by date recorded, and an audit trail of changes made to your data." />
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader title="Recently recorded" />
          <TxList ctx={ctx} txs={recentTx} />
        </Card>
        <Card className="lg:col-span-5">
          <CardHeader title="Audit trail" subtitle="Changes and security events" />
          <ul className="divide-y divide-line">
            {log.map((l) => (
              <li key={l.id} className="px-5 py-2.5 text-[13px]">
                <p>{ACTION_LABELS[l.action] ?? l.action}</p>
                <p className="text-[11.5px] text-muted">
                  {formatDate(l.createdAt.toISOString().slice(0, 10), ctx.fmt)} {l.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  {l.ip && ` · ${l.ip}`}
                </p>
              </li>
            ))}
            {!log.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No activity yet.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
