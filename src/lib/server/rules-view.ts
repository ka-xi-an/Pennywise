import "server-only";
import type { Ctx, RuleRec } from "./data";
import { categoryLabel } from "./data";
import type { RuleOptions, RuleInitial } from "@/components/rule-fields";
import { minorToInput } from "../format";
import { nextOccurrence, occurrencesBetween, occurrenceState, type OccurrenceState } from "../finance/recurring";
import { addDays } from "../finance/dates";

export function ruleOptions(ctx: Ctx): RuleOptions {
  return {
    accounts: ctx.accounts.filter((a) => a.status === "ACTIVE").map((a) => ({ id: a.id, name: a.name, type: a.type })),
    categories: ctx.categories.filter((c) => !c.archived).map((c) => ({ id: c.id, label: categoryLabel(ctx, c.id), kind: c.kind })),
    loans: ctx.loans.map((l) => ({ id: l.id, name: l.name, accountId: l.accountId })),
    today: ctx.today,
    sym: ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency,
  };
}

export function ruleInitial(r: RuleRec): RuleInitial {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    billType: r.billType,
    txType: r.txType,
    amount: minorToInput(r.amount, r.currency),
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    categoryId: r.categoryId,
    merchant: r.merchant,
    paymentMethod: r.paymentMethod,
    frequency: r.frequency,
    interval: r.interval,
    startDate: r.startDate,
    endDate: r.endDate,
    autoPost: r.autoPost,
    reminderDays: r.reminderDays,
    loanId: r.loanId,
    notes: r.notes,
  };
}

export interface OccurrenceView {
  rule: RuleRec;
  due: string;
  state: OccurrenceState;
  transactionId: string | null;
  paidDate: string | null;
}

/** Occurrences of the given rules in a window, with their paid/skipped/overdue state. */
export function occurrencesView(ctx: Ctx, rules: RuleRec[], from: string, to: string): OccurrenceView[] {
  return rules
    .flatMap((r) => {
      const rec = new Map(r.occurrences.map((o) => [o.dueDate, o]));
      return occurrencesBetween(r, from, to).map((d) => {
        const o = rec.get(d);
        return { rule: r, due: d, state: occurrenceState(d, ctx.today, o?.status, r.reminderDays), transactionId: o?.transactionId ?? null, paidDate: o?.paidDate ?? null };
      });
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

export function nextDue(ctx: Ctx, r: RuleRec) {
  const paid = new Set(r.occurrences.map((o) => o.dueDate));
  // earliest unpaid occurrence from 60 days ago onward
  for (const d of occurrencesBetween(r, addDays(ctx.today, -60), addDays(ctx.today, 800), 400)) if (!paid.has(d)) return d;
  return nextOccurrence(r, ctx.today);
}
