import "server-only";
import type { Ctx } from "./data";
import { accountName, categoryLabel, categoryColor } from "./data";
import type { TxRec } from "../finance/types";
import { TX_TYPE_LABELS } from "../finance/types";
import { formatMoney } from "../format";

/** How a transaction reads in lists: signed from the user's point of view. */
export function txView(ctx: Ctx, t: TxRec) {
  const fmt = { ...ctx.fmt, currency: t.currency };
  const inflow = ["INCOME", "DIVIDEND", "INTEREST", "REFUND", "INVESTMENT_SELL"].includes(t.type) || (t.type === "ADJUSTMENT" && t.amount > 0);
  const neutral = t.type === "TRANSFER" || t.type === "LOAN_DISBURSEMENT";
  const amount = t.type === "ADJUSTMENT" ? Math.abs(t.amount) : t.amount;
  const amountText = neutral ? formatMoney(amount, fmt) : `${inflow ? "+" : "−"}${formatMoney(amount, fmt)}`;
  const title =
    t.merchant ||
    t.description ||
    (neutral ? `${accountName(ctx, t.accountId)} → ${accountName(ctx, t.toAccountId)}` : categoryLabel(ctx, t.categoryId));
  let subtitle: string;
  if (neutral) subtitle = `${TX_TYPE_LABELS[t.type]} · ${accountName(ctx, t.accountId)} → ${accountName(ctx, t.toAccountId)}`;
  else if (t.type === "LOAN_REPAYMENT")
    subtitle = `Loan repayment · principal ${formatMoney(t.principalAmount ?? 0, fmt)} · interest ${formatMoney(t.interestAmount ?? 0, fmt)}`;
  else if (t.type === "EXPENSE" || t.type === "INCOME") subtitle = `${categoryLabel(ctx, t.categoryId)} · ${accountName(ctx, t.accountId)}`;
  else subtitle = `${TX_TYPE_LABELS[t.type]} · ${accountName(ctx, t.accountId)}`;
  return {
    title,
    subtitle,
    amountText,
    tone: neutral ? ("neutral" as const) : inflow ? ("pos" as const) : ("neg" as const),
    color: neutral ? "#94a3b8" : categoryColor(ctx, t.categoryId),
  };
}
