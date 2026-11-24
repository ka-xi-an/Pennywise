import "server-only";
import { db, n } from "../db";
import { occurrencesBetween, type Frequency } from "@/lib/finance/recurring";
import { addDays } from "@/lib/finance/dates";
import type { TxType } from "@/lib/finance/types";
import { createTransactionTx } from "./transactions";

/**
 * Posts due occurrences of auto-post rules (salary, SIP, EMIs…) up to today.
 * Idempotent: each (rule, dueDate) pair can only ever be recorded once (unique index).
 * Looks back at most 62 days so a long absence never floods the ledger silently.
 */
export async function autoPostRecurring(userId: string, today: string) {
  const rules = await db.recurringRule.findMany({
    where: { userId, active: true, autoPost: true },
    include: { occurrences: { select: { dueDate: true } } },
  });
  let posted = 0;
  for (const r of rules) {
    const from = r.startDate > addDays(today, -62) ? r.startDate : addDays(today, -62);
    const due = occurrencesBetween(
      { frequency: r.frequency as Frequency, interval: r.interval, startDate: r.startDate, endDate: r.endDate },
      from,
      today,
    );
    const done = new Set(r.occurrences.map((o) => o.dueDate));
    for (const d of due) {
      if (done.has(d)) continue;
      try {
        await db.$transaction(async (tx) => {
          const t = await createTransactionTx(tx, userId, {
            type: r.txType as TxType,
            amount: n(r.amount),
            date: d,
            accountId: r.accountId,
            toAccountId: r.toAccountId,
            toAmount: null,
            categoryId: r.categoryId,
            merchant: r.merchant,
            paymentMethod: r.paymentMethod,
            description: r.name,
            notes: "Auto-posted from recurring schedule",
            tags: [],
            principalAmount: null,
            interestAmount: null,
            loanId: r.loanId,
            refundOfId: null,
            holdingId: null,
            quantity: null,
            price: null,
            fees: 0,
            recurringRuleId: r.id,
            isDemo: r.isDemo,
          });
          await tx.recurringOccurrence.create({ data: { ruleId: r.id, dueDate: d, status: "PAID", transactionId: t.id, paidDate: d } });
          await tx.notification.create({
            data: {
              userId,
              type: "recurring",
              severity: "info",
              title: `Recorded: ${r.name}`,
              body: `Auto-posted the ${d} occurrence. Review it in Transactions if anything changed.`,
              link: "/transactions",
              dedupeKey: `posted:${r.id}:${d}`,
            },
          });
        });
        posted++;
      } catch (e) {
        // A rule that can no longer post (e.g. account closed) raises a visible notification instead of failing silently.
        await db.notification
          .create({
            data: {
              userId,
              type: "recurring",
              severity: "warning",
              title: `Could not auto-post “${r.name}”`,
              body: e instanceof Error ? e.message : "Check the schedule's account and category.",
              link: "/recurring",
              dedupeKey: `postfail:${r.id}:${d}`,
            },
          })
          .catch(() => {});
        break;
      }
    }
  }
  return posted;
}
