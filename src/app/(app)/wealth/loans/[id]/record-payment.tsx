"use client";

import { useState } from "react";
import { Banknote } from "lucide-react";
import { btnClass } from "@/components/ui/core";
import { Dialog } from "@/components/ui/modal";
import { TransactionForm, type TxFormInitial, type TxFormOptions } from "@/components/transaction-form";

export function RecordPayment({ options, initial }: { options: TxFormOptions; initial: TxFormInitial }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={btnClass("primary")} onClick={() => setOpen(true)}>
        <Banknote className="size-4" /> Record payment
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Record loan payment" description="Leave principal/interest blank to split automatically using the loan's rate. Add extra for a prepayment." size="lg">
        <TransactionForm options={options} initial={initial} lockType onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
