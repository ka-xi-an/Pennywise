import "server-only";
import type { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { big } from "../db";
import { valueOf } from "@/lib/finance/money";
import type { InvTxType } from "@/lib/finance/investments";

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export interface InvTxInput {
  holdingId: string;
  type: InvTxType;
  date: string;
  quantity: string | null;
  price: string | null;
  amount: number | null; // gross value in minor units (VALUE mode / dividends / fees)
  fees: number;
  ratio: string | null;
  cashAccountId: string | null; // when set, cash movement is posted to the ledger
  notes: string | null;
  isDemo?: boolean;
}

/**
 * Records an investment transaction and (optionally) its linked cash movement in the
 * ledger, inside the caller's DB transaction so both succeed or neither does.
 *   BUY/SIP  → ledger INVESTMENT_BUY  (gross + fees out of the cash account)
 *   SELL     → ledger INVESTMENT_SELL (gross − fees into the cash account)
 *   DIVIDEND → ledger DIVIDEND, INTEREST → ledger INTEREST (income)
 *   FEES / TAX_WITHHOLDING → ledger EXPENSE
 *   BONUS / SPLIT / MERGER → no cash
 */
export async function recordInvestmentTx(tx: Prisma.TransactionClient, userId: string, i: InvTxInput) {
  const holding = await tx.investmentHolding.findFirst({ where: { id: i.holdingId, userId } });
  if (!holding) throw new ValidationError("Holding not found", "holdingId");
  const valueMode = holding.valuationMode === "VALUE";
  let gross = i.amount ?? 0;
  const needsUnits = !valueMode && ["BUY", "SIP", "SELL"].includes(i.type);
  if (needsUnits) {
    if (!i.quantity || new Decimal(i.quantity).lte(0)) throw new ValidationError("Quantity must be greater than zero", "quantity");
    if (!i.price || new Decimal(i.price).lt(0)) throw new ValidationError("Price is required", "price");
    gross = valueOf(i.quantity, i.price, holding.currency);
  }
  if (["BUY", "SIP", "SELL", "DIVIDEND", "INTEREST", "FEES", "TAX_WITHHOLDING"].includes(i.type) && gross <= 0)
    throw new ValidationError("Amount must be greater than zero", "amount");
  if (["SPLIT", "MERGER"].includes(i.type) && (!i.ratio || new Decimal(i.ratio).lte(0)))
    throw new ValidationError("Ratio (new units per old unit) is required", "ratio");
  if (i.type === "BONUS" && !i.quantity && !i.ratio) throw new ValidationError("Enter bonus units or a ratio", "quantity");
  if (i.type === "SELL" && !valueMode) {
    // Prevent selling more units than held on that date.
    const prior = await tx.investmentTransaction.findMany({ where: { holdingId: holding.id, date: { lte: i.date } }, orderBy: { date: "asc" } });
    let q = new Decimal(0);
    for (const p of prior) {
      if (p.type === "BUY" || p.type === "SIP") q = q.plus(p.quantity ?? 0);
      else if (p.type === "SELL") q = q.minus(p.quantity ?? 0);
      else if (p.type === "BONUS") q = p.quantity ? q.plus(p.quantity) : q.plus(q.mul(p.ratio ?? 0));
      else if (p.type === "SPLIT" || p.type === "MERGER") q = q.mul(p.ratio ?? 1);
    }
    if (q.lt(i.quantity!)) throw new ValidationError(`Only ${q.toString()} units held on ${i.date}`, "quantity");
  }

  let cashTransactionId: string | null = null;
  const ledgerType: Record<string, string | null> = {
    BUY: "INVESTMENT_BUY",
    SIP: "INVESTMENT_BUY",
    SELL: "INVESTMENT_SELL",
    DIVIDEND: "DIVIDEND",
    INTEREST: "INTEREST",
    FEES: "EXPENSE",
    TAX_WITHHOLDING: "EXPENSE",
    BONUS: null,
    SPLIT: null,
    MERGER: null,
  };
  const lt = ledgerType[i.type];
  if (lt && i.cashAccountId) {
    const acc = await tx.account.findFirst({ where: { id: i.cashAccountId, userId } });
    if (!acc) throw new ValidationError("Cash account not found", "cashAccountId");
    if (acc.currency !== holding.currency) throw new ValidationError("Cash account currency must match the holding currency", "cashAccountId");
    if (acc.type === "LOAN") throw new ValidationError("Choose a bank, cash or brokerage account", "cashAccountId");
    const cashAmount = i.type === "BUY" || i.type === "SIP" ? gross + i.fees : i.type === "SELL" ? gross - i.fees : gross;
    if (cashAmount <= 0) throw new ValidationError("Fees exceed the transaction value", "fees");
    let categoryId: string | null = null;
    const catName = i.type === "DIVIDEND" ? "Dividends" : i.type === "INTEREST" ? "Interest" : i.type === "FEES" ? "Bank charges" : i.type === "TAX_WITHHOLDING" ? "Taxes paid" : null;
    if (catName) categoryId = (await tx.category.findFirst({ where: { userId, name: catName }, select: { id: true } }))?.id ?? null;
    const cash = await tx.transaction.create({
      data: {
        userId,
        type: lt,
        amount: big(cashAmount),
        currency: acc.currency,
        date: i.date,
        accountId: acc.id,
        categoryId,
        merchant: holding.name,
        description: `${i.type === "SIP" ? "SIP" : i.type.charAt(0) + i.type.slice(1).toLowerCase().replace("_", " ")} · ${holding.name}`,
        paymentMethod: i.type === "SIP" ? "AUTO_DEBIT" : null,
        isDemo: i.isDemo ?? false,
      },
    });
    cashTransactionId = cash.id;
  }

  return tx.investmentTransaction.create({
    data: {
      userId,
      holdingId: holding.id,
      type: i.type,
      date: i.date,
      quantity: i.quantity,
      price: i.price,
      amount: big(gross),
      fees: big(i.fees),
      ratio: i.ratio,
      cashTransactionId,
      notes: i.notes,
      isDemo: i.isDemo ?? false,
    },
  });
}

/** Deletes an investment transaction together with its linked ledger cash movement. */
export async function deleteInvestmentTx(tx: Prisma.TransactionClient, userId: string, id: string) {
  const it = await tx.investmentTransaction.findFirst({ where: { id, userId } });
  if (!it) throw new ValidationError("Investment transaction not found");
  await tx.investmentTransaction.delete({ where: { id: it.id } });
  if (it.cashTransactionId) await tx.transaction.deleteMany({ where: { id: it.cashTransactionId, userId } });
  return it;
}
