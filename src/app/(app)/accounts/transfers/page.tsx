import { pageCtx } from "@/lib/server/page";
import { txFormOptions } from "@/lib/server/options";
import { Card, CardHeader, PageHeader } from "@/components/ui/core";
import { TransactionForm } from "@/components/transaction-form";
import { TxList } from "@/components/tx-list";

export const metadata = { title: "Account transfers" };

export default async function TransfersPage() {
  const ctx = await pageCtx();
  const options = await txFormOptions(ctx);
  const transfers = ctx.txsNative.filter((t) => t.type === "TRANSFER").slice(0, 30);
  return (
    <>
      <PageHeader title="Account transfers" description="Move money between your own accounts — paying a credit card, topping up a wallet, sweeping to savings. Transfers never count as income or spending." />
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="h-fit lg:col-span-5">
          <CardHeader title="New transfer" />
          <div className="px-5 pb-4">
            {ctx.accounts.length < 2 ? (
              <p className="pb-2 text-[13px] text-muted">You need at least two accounts to transfer between.</p>
            ) : (
              <TransactionForm options={options} initial={{ type: "TRANSFER" }} lockType />
            )}
          </div>
        </Card>
        <Card className="lg:col-span-7">
          <CardHeader title="Recent transfers" />
          <TxList ctx={ctx} txs={transfers} empty="No transfers yet." />
        </Card>
      </div>
    </>
  );
}
