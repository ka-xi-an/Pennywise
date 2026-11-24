/**
 * Domain types for the financial engine. All money values are integer MINOR UNITS
 * (e.g. paise) held in JS numbers — exact for |x| < 2^53 (≈ ₹90 trillion).
 * Dates are ISO "YYYY-MM-DD" strings.
 */
export type Minor = number;
export type ISODate = string;

export const ACCOUNT_TYPES = [
  "SAVINGS",
  "CURRENT",
  "CASH",
  "WALLET",
  "CREDIT_CARD",
  "INVESTMENT",
  "LOAN",
  "FOREIGN_CURRENCY",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  SAVINGS: "Savings account",
  CURRENT: "Current account",
  CASH: "Cash",
  WALLET: "Digital wallet",
  CREDIT_CARD: "Credit card",
  INVESTMENT: "Investment account",
  LOAN: "Loan account",
  FOREIGN_CURRENCY: "Foreign currency account",
};

/** Account types whose natural balance is a liability (negative = owed). */
export const LIABILITY_ACCOUNT_TYPES: AccountType[] = ["CREDIT_CARD", "LOAN"];

export const TX_TYPES = [
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "INVESTMENT_BUY",
  "INVESTMENT_SELL",
  "DIVIDEND",
  "INTEREST",
  "LOAN_DISBURSEMENT",
  "LOAN_REPAYMENT",
  "REFUND",
  "ADJUSTMENT",
] as const;
export type TxType = (typeof TX_TYPES)[number];

export const TX_TYPE_LABELS: Record<TxType, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
  INVESTMENT_BUY: "Investment purchase",
  INVESTMENT_SELL: "Investment sale",
  DIVIDEND: "Dividend",
  INTEREST: "Interest",
  LOAN_DISBURSEMENT: "Loan disbursement",
  LOAN_REPAYMENT: "Loan repayment",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

export const PAYMENT_METHODS = [
  "UPI",
  "CASH",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "NET_BANKING",
  "NEFT_IMPS_RTGS",
  "CHEQUE",
  "AUTO_DEBIT",
  "WALLET",
  "OTHER",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  UPI: "UPI",
  CASH: "Cash",
  DEBIT_CARD: "Debit card",
  CREDIT_CARD: "Credit card",
  NET_BANKING: "Net banking",
  NEFT_IMPS_RTGS: "NEFT / IMPS / RTGS",
  CHEQUE: "Cheque",
  AUTO_DEBIT: "Auto-debit / NACH",
  WALLET: "Wallet",
  OTHER: "Other",
};

export interface AccountRec {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  currency: string;
  openingBalance: Minor;
  openingDate: ISODate;
  maskedNumber: string | null;
  creditLimit: Minor | null;
  status: "ACTIVE" | "CLOSED";
  includeInNetWorth: boolean;
  isDemo: boolean;
}

export interface CategoryRec {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId: string | null;
  color: string;
  essential: boolean;
  taxable: boolean;
  archived: boolean;
}

export interface TxRec {
  id: string;
  type: TxType;
  amount: Minor;
  currency: string;
  date: ISODate;
  accountId: string;
  toAccountId: string | null;
  toAmount: Minor | null;
  categoryId: string | null;
  merchant: string | null;
  paymentMethod: string | null;
  description: string | null;
  principalAmount: Minor | null;
  interestAmount: Minor | null;
  refundOfId: string | null;
  isDemo: boolean;
}

export interface DateRange {
  from: ISODate;
  to: ISODate;
}
