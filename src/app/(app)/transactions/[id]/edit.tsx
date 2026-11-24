"use client";

import { useState } from "react";
import { Pencil, Undo2 } from "lucide-react";
import { Card, CardHeader, btnClass } from "@/components/ui/core";
import { Dialog } from "@/components/ui/modal";
import { TransactionForm, type TxFormInitial, type TxFormOptions } from "@/components/transaction-form";

export function EditTransaction({
  options,
  initial,
  refundable,
  refundInitial,
}: {
  options: TxFormOptions;
  initial: TxFormInitial;
  refundable: boolean;
  refundInitial: TxFormInitial;
}) {
  const [refund, setRefund] = useState(false);
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Pencil className="size-4 text-muted" /> Edit transaction
          </span>
        }
        subtitle="Changes update balances, budgets, reports and net worth immediately."
        action={
          refundable ? (
            <button className={btnClass("secondary", "sm")} onClick={() => setRefund(true)}>
              <Undo2 className="size-3.5" /> Record refund
            </button>
          ) : null
        }
      />
      <div className="px-5 pb-4">
        <TransactionForm options={options} initial={initial} />
      </div>
      <Dialog open={refund} onClose={() => setRefund(false)} title="Record refund" size="lg">
        <TransactionForm options={options} initial={refundInitial} lockType onDone={() => setRefund(false)} />
      </Dialog>
    </Card>
  );
}
