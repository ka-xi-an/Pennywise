import "server-only";
import { cache } from "react";
import { db, n } from "./db";
import type { AccountRec, AccountType, CategoryRec, ISODate, Minor, TxRec, TxType } from "../finance/types";
import { makeConverter, type Converter } from "../finance/fx";
import { accountBalances, cashFlowStatement, indexCategories, monthlySeries, normalizeToBase, summarize, type CategoryIndex } from "../finance/ledger";
import { buildPortfolio, type AssetClass, type HoldingRec, type InvTxRec, type InvTxType, type PortfolioSummary } from "../finance/investments";
import { computeNetWorth, type NetWorth } from "../finance/networth";
import { addDays, addMonths, endOfMonth, startOfMonth, todayIn } from "../finance/dates";
import { coefficientOfVariation, healthScore, type HealthInputs } from "../finance/health";
import { goalProgress, type GoalProgress } from "../finance/goals";
import type { FormatPrefs } from "../format";
import type { Frequency } from "../finance/recurring";
import { autoPostRecurring } from "./services/recurring";

export interface NotificationPrefs {
  budget: boolean;
  bills: boolean;
  largeExpense: boolean;
  unusual: boolean;
  recurring: boolean;
  maturity: boolean;
  goals: boolean;
  cashflow: boolean;
}
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  budget: true,
  bills: true,
  largeExpense: true,
  unusual: true,
  recurring: true,
  maturity: true,
  goals: true,
  cashflow: true,
};

export interface Prefs {
  baseCurrency: string;
  locale: string;
  timezone: string;
  fyStartMonth: number;
  dateFormat: string;
  theme: string;
  onboarded: boolean;
  demoMode: boolean;
  largeExpenseThreshold: Minor;
  emergencyFundMonths: number;
  notificationPrefs: NotificationPrefs;
  dashboardLayout: string[];
  targetAllocation: Record<string, number>;
}

function safeJSON<T>(s: string | null | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const getPrefs = cache(async (userId: string): Promise<Prefs> => {
  const p =
    (await db.userPreference.findUnique({ where: { userId } })) ??
    (await db.userPreference.create({ data: { userId } }));
  return {
    baseCurrency: p.baseCurrency,
    locale: p.locale,
    timezone: p.timezone,
    fyStartMonth: p.fyStartMonth,
    dateFormat: p.dateFormat,
    theme: p.theme,
    onboarded: p.onboarded,
    demoMode: p.demoMode,
    largeExpenseThreshold: n(p.largeExpenseThreshold),
    emergencyFundMonths: p.emergencyFundMonths,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...safeJSON(p.notificationPrefs, {}) },
    dashboardLayout: safeJSON<string[]>(p.dashboardLayout, []),
    targetAllocation: safeJSON<Record<string, number>>(p.targetAllocation, {}),
  };
});

export function fmtPrefs(p: Prefs): FormatPrefs {
  return { currency: p.baseCurrency, locale: p.locale, dateFormat: p.dateFormat };
}

export interface LoanRec {
  id: string;
  accountId: string;
  name: string;
  lender: string | null;
  loanType: string;
  principal: Minor;
  interestRate: string;
  tenureMonths: number;
  startDate: ISODate;
  emi: Minor;
  emiDay: number;
  status: string;
  isDemo: boolean;
  outstanding: Minor; // derived from the loan account balance
  currency: string;
}

export interface GoalRec {
  id: string;
  name: string;
  type: string;
  targetAmount: Minor;
  targetDate: ISODate | null;
  priority: number;
  monthlyContribution: Minor;
  trackingMode: string;
  startingAmount: Minor;
  expectedReturn: string | null;
  status: string;
  notes: string | null;
  isDemo: boolean;
  accountIds: string[];
  contributionsTotal: Minor;
  current: Minor;
  progress: GoalProgress;
}

export interface RuleRec {
  id: string;
  name: string;
  kind: string;
  billType: string | null;
  txType: TxType;
  amount: Minor;
  currency: string;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  paymentMethod: string | null;
  frequency: Frequency;
  interval: number;
  startDate: ISODate;
  endDate: ISODate | null;
  autoPost: boolean;
  reminderDays: number;
  loanId: string | null;
  active: boolean;
  notes: string | null;
  isDemo: boolean;
  occurrences: { dueDate: ISODate; status: "PAID" | "SKIPPED"; transactionId: string | null; paidDate: string | null }[];
}

export interface Ctx {
  userId: string;
  prefs: Prefs;
  fmt: FormatPrefs;
  today: ISODate;
  fx: Converter;
  accounts: AccountRec[];
  accountById: Map<string, AccountRec>;
  categories: CategoryRec[];
  catIdx: CategoryIndex;
  txsNative: TxRec[];
  txs: TxRec[]; // base currency
  unconverted: TxRec[];
  balances: Map<string, Minor>;
  holdings: HoldingRec[];
  invTxs: InvTxRec[];
  portfolio: PortfolioSummary;
  assets: { id: string; name: string; type: string; currency: string; currentValue: Minor; valuationDate: ISODate; purchaseValue: Minor | null; purchaseDate: ISODate | null; notes: string | null; isDemo: boolean }[];
  liabilities: { id: string; name: string; type: string; currency: string; outstanding: Minor; interestRate: string | null; asOfDate: ISODate; notes: string | null; isDemo: boolean }[];
  loans: LoanRec[];
  goals: GoalRec[];
  rules: RuleRec[];
  netWorth: NetWorth;
  earliestDate: ISODate;
}

/** Once per request: post due auto-recurring items before anything reads the ledger. */
const syncUser = cache(async (userId: string) => {
  const prefs = await getPrefs(userId);
  try {
    await autoPostRecurring(userId, todayIn(prefs.timezone));
  } catch (e) {
    console.error("recurring sync failed", e);
  }
});

export const getCtx = cache(async (userId: string): Promise<Ctx> => {
  await syncUser(userId);
  return loadCtx(userId);
});

async function loadCtx(userId: string): Promise<Ctx> {
  const prefs = await getPrefs(userId);
  const today = todayIn(prefs.timezone);
  const [accountsRaw, categoriesRaw, txRaw, holdingsRaw, invRaw, assetsRaw, liabRaw, loansRaw, fxRaw, goalsRaw, rulesRaw] =
    await Promise.all([
      db.account.findMany({ where: { userId }, orderBy: [{ status: "asc" }, { createdAt: "asc" }] }),
      db.category.findMany({ where: { userId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      db.transaction.findMany({
        where: { userId },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          date: true,
          accountId: true,
          toAccountId: true,
          toAmount: true,
          categoryId: true,
          merchant: true,
          paymentMethod: true,
          description: true,
          principalAmount: true,
          interestAmount: true,
          refundOfId: true,
          isDemo: true,
        },
      }),
      db.investmentHolding.findMany({ where: { userId }, orderBy: { name: "asc" } }),
      db.investmentTransaction.findMany({ where: { userId }, orderBy: { date: "asc" } }),
      db.asset.findMany({ where: { userId }, orderBy: { currentValue: "desc" } }),
      db.liability.findMany({ where: { userId }, orderBy: { outstanding: "desc" } }),
      db.loan.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      db.fxRate.findMany({ where: { userId } }),
      db.goal.findMany({
        where: { userId },
        include: { accounts: true, contributions: true },
        orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
      }),
      db.recurringRule.findMany({ where: { userId }, include: { occurrences: true }, orderBy: { name: "asc" } }),
    ]);

  const accounts: AccountRec[] = accountsRaw.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    type: a.type as AccountType,
    currency: a.currency,
    openingBalance: n(a.openingBalance),
    openingDate: a.openingDate,
    maskedNumber: a.maskedNumber,
    creditLimit: n(a.creditLimit),
    status: a.status as "ACTIVE" | "CLOSED",
    includeInNetWorth: a.includeInNetWorth,
    isDemo: a.isDemo,
  }));
  const categories: CategoryRec[] = categoriesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind as "INCOME" | "EXPENSE",
    parentId: c.parentId,
    color: c.color,
    essential: c.essential,
    taxable: c.taxable,
    archived: c.archived,
  }));
  const txsNative: TxRec[] = txRaw.map((t) => ({
    ...t,
    type: t.type as TxType,
    amount: n(t.amount),
    toAmount: n(t.toAmount),
    principalAmount: n(t.principalAmount),
    interestAmount: n(t.interestAmount),
  }));
  const fx = makeConverter(prefs.baseCurrency, fxRaw);
  const { txs, unconverted } = normalizeToBase(txsNative, fx);
  const balances = accountBalances(accounts, txsNative);

  const holdings: HoldingRec[] = holdingsRaw.map((h) => ({
    id: h.id,
    name: h.name,
    symbol: h.symbol,
    assetClass: h.assetClass as AssetClass,
    valuationMode: h.valuationMode as "UNITS" | "VALUE",
    currency: h.currency,
    currentPrice: h.currentPrice,
    currentValue: n(h.currentValue),
    priceDate: h.priceDate,
    priceSource: h.priceSource,
    maturityDate: h.maturityDate,
    interestRate: h.interestRate,
    accountId: h.accountId,
    status: h.status,
    isDemo: h.isDemo,
  }));
  const invTxs: InvTxRec[] = invRaw.map((t) => ({
    id: t.id,
    holdingId: t.holdingId,
    type: t.type as InvTxType,
    date: t.date,
    quantity: t.quantity,
    price: t.price,
    amount: n(t.amount),
    fees: n(t.fees),
    ratio: t.ratio,
  }));
  const portfolio = buildPortfolio(holdings, invTxs, today);
  const assets = assetsRaw.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    currency: a.currency,
    currentValue: n(a.currentValue),
    valuationDate: a.valuationDate,
    purchaseValue: n(a.purchaseValue),
    purchaseDate: a.purchaseDate,
    notes: a.notes,
    isDemo: a.isDemo,
  }));
  const liabilities = liabRaw.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    currency: l.currency,
    outstanding: n(l.outstanding),
    interestRate: l.interestRate,
    asOfDate: l.asOfDate,
    notes: l.notes,
    isDemo: l.isDemo,
  }));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const loans: LoanRec[] = loansRaw.map((l) => ({
    id: l.id,
    accountId: l.accountId,
    name: l.name,
    lender: l.lender,
    loanType: l.loanType,
    principal: n(l.principal),
    interestRate: l.interestRate,
    tenureMonths: l.tenureMonths,
    startDate: l.startDate,
    emi: n(l.emi),
    emiDay: l.emiDay,
    status: l.status,
    isDemo: l.isDemo,
    outstanding: Math.max(0, -(balances.get(l.accountId) ?? 0)),
    currency: accountById.get(l.accountId)?.currency ?? prefs.baseCurrency,
  }));

  const netWorth = computeNetWorth({ accounts, balances, positions: portfolio.positions, assets, liabilities, fx, today });

  const goals: GoalRec[] = goalsRaw.map((g) => {
    const contributionsTotal = g.contributions.reduce((s, c) => s + n(c.amount), 0);
    const accountIds = g.accounts.map((a) => a.accountId);
    const targetAmount = n(g.targetAmount);
    let current = n(g.startingAmount) + contributionsTotal;
    if (g.trackingMode === "ACCOUNTS") {
      const linked = accountIds.map((id) => {
        const acc = accountById.get(id);
        return acc ? fx.convert(balances.get(id) ?? 0, acc.currency, today) ?? 0 : 0;
      });
      current =
        g.type === "DEBT_FREE"
          ? Math.max(0, targetAmount - linked.reduce((s, v) => s + Math.max(0, -v), 0))
          : linked.reduce((s, v) => s + v, 0) + contributionsTotal;
    } else if (g.trackingMode === "NET_WORTH") current = netWorth.netWorth;
    const rec = {
      id: g.id,
      name: g.name,
      type: g.type,
      targetAmount,
      targetDate: g.targetDate,
      priority: g.priority,
      monthlyContribution: n(g.monthlyContribution),
      trackingMode: g.trackingMode,
      startingAmount: n(g.startingAmount),
      expectedReturn: g.expectedReturn,
      status: g.status,
      notes: g.notes,
      isDemo: g.isDemo,
      accountIds,
      contributionsTotal,
      current,
    };
    return { ...rec, progress: goalProgress(rec, current, today) };
  });

  const rules: RuleRec[] = rulesRaw.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    billType: r.billType,
    txType: r.txType as TxType,
    amount: n(r.amount),
    currency: r.currency,
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    categoryId: r.categoryId,
    merchant: r.merchant,
    paymentMethod: r.paymentMethod,
    frequency: r.frequency as Frequency,
    interval: r.interval,
    startDate: r.startDate,
    endDate: r.endDate,
    autoPost: r.autoPost,
    reminderDays: r.reminderDays,
    loanId: r.loanId,
    active: r.active,
    notes: r.notes,
    isDemo: r.isDemo,
    occurrences: r.occurrences.map((o) => ({
      dueDate: o.dueDate,
      status: o.status as "PAID" | "SKIPPED",
      transactionId: o.transactionId,
      paidDate: o.paidDate,
    })),
  }));

  const earliest = [txsNative.at(-1)?.date, ...accounts.map((a) => a.openingDate)].filter(Boolean).sort()[0] ?? today;

  return {
    userId,
    prefs,
    fmt: fmtPrefs(prefs),
    today,
    fx,
    accounts,
    accountById,
    categories,
    catIdx: indexCategories(categories),
    txsNative,
    txs,
    unconverted,
    balances,
    holdings,
    invTxs,
    portfolio,
    assets,
    liabilities,
    loans,
    goals,
    rules,
    netWorth,
    earliestDate: earliest as ISODate,
  };
}

/** The last N complete calendar months (excluding the current month). */
export function lastCompleteMonths(today: ISODate, count: number) {
  const end = addDays(startOfMonth(today), -1);
  const from = addMonths(startOfMonth(today), -count);
  return { from, to: end };
}

export interface KeyMetrics {
  avgMonthlyIncome: Minor;
  avgMonthlyExpenses: Minor;
  avgMonthlySavings: Minor;
  avgNetCashFlow: Minor;
  savingsRate: number | null;
  emergencyMonths: number | null;
  monthlyDebtPayments: Minor;
  debtToIncome: number | null;
  creditUtilization: number | null;
  expenseVolatility: number | null;
  positiveMonthsRatio: number | null;
  monthsOfData: number;
  basis: string;
}

/**
 * Trailing metrics over the last 3 complete months (falls back to the current month
 * when there is no history yet). Volatility / consistency use the last 6 complete months.
 */
export function keyMetrics(ctx: Ctx): KeyMetrics {
  const r3 = lastCompleteMonths(ctx.today, 3);
  const r6 = lastCompleteMonths(ctx.today, 6);
  const hist6 = monthlySeries(ctx.txs, r6).filter((m) => `${m.month}-31` >= ctx.earliestDate);
  const hist3 = hist6.slice(-3).filter((m) => m.income || m.expenses);
  let basis = `last ${hist3.length} complete month${hist3.length === 1 ? "" : "s"}`;
  let income: number, expenses: number, months: number;
  if (hist3.length) {
    income = hist3.reduce((s, m) => s + m.income, 0);
    expenses = hist3.reduce((s, m) => s + m.expenses, 0);
    months = hist3.length;
  } else {
    const cur = summarize(ctx.txs, { from: startOfMonth(ctx.today), to: endOfMonth(ctx.today) });
    income = cur.income;
    expenses = cur.expenses;
    months = 1;
    basis = "current month only (no complete months yet)";
  }
  const avgIncome = Math.round(income / months);
  const avgExpenses = Math.round(expenses / months);
  const cf = cashFlowStatement(
    ctx.accounts.filter((a) => a.currency === ctx.prefs.baseCurrency),
    ctx.txs,
    hist3.length ? { from: `${hist3[0].month}-01`, to: r3.to } : { from: startOfMonth(ctx.today), to: ctx.today },
  );
  const cfNet = cf.netChange - cf.newAccountOpenings;
  const monthlyDebtPayments = ctx.loans.filter((l) => l.status === "ACTIVE" && l.outstanding > 0).reduce((s, l) => s + l.emi, 0);
  const cards = ctx.accounts.filter((a) => a.type === "CREDIT_CARD" && a.status === "ACTIVE" && a.creditLimit);
  const limit = cards.reduce((s, a) => s + (a.creditLimit ?? 0), 0);
  const used = cards.reduce((s, a) => s + Math.max(0, -(ctx.balances.get(a.id) ?? 0)), 0);
  const nonEmpty6 = hist6.filter((m) => m.income || m.expenses);
  return {
    avgMonthlyIncome: avgIncome,
    avgMonthlyExpenses: avgExpenses,
    avgMonthlySavings: avgIncome - avgExpenses,
    avgNetCashFlow: Math.round(cfNet / months),
    savingsRate: avgIncome > 0 ? ((avgIncome - avgExpenses) / avgIncome) * 100 : null,
    emergencyMonths: avgExpenses > 0 ? ctx.netWorth.liquidAssets / avgExpenses : null,
    monthlyDebtPayments,
    debtToIncome: avgIncome > 0 ? (monthlyDebtPayments / avgIncome) * 100 : null,
    creditUtilization: limit > 0 ? (used / limit) * 100 : null,
    expenseVolatility: coefficientOfVariation(nonEmpty6.map((m) => m.expenses)),
    positiveMonthsRatio: nonEmpty6.length >= 3 ? (nonEmpty6.filter((m) => m.savings > 0).length / nonEmpty6.length) * 100 : null,
    monthsOfData: nonEmpty6.length,
    basis,
  };
}

export function healthInputs(ctx: Ctx, m: KeyMetrics): HealthInputs {
  const alloc = ctx.portfolio.allocation;
  const activeGoals = ctx.goals.filter((g) => g.status === "ACTIVE" && g.targetDate);
  return {
    savingsRate: m.savingsRate,
    emergencyMonths: m.emergencyMonths,
    debtToIncome: m.debtToIncome,
    debtToAsset: ctx.netWorth.totalAssets > 0 ? ctx.netWorth.debtToAsset : null,
    expenseVolatility: m.expenseVolatility,
    positiveMonthsRatio: m.positiveMonthsRatio,
    diversification: alloc.length ? { classes: alloc.length, largestPct: alloc[0].pct } : null,
    goalsOnTrackPct: activeGoals.length
      ? (activeGoals.filter((g) => g.progress.onTrack).length / activeGoals.length) * 100
      : null,
  };
}

export function health(ctx: Ctx) {
  const m = keyMetrics(ctx);
  return { metrics: m, result: healthScore(healthInputs(ctx, m)) };
}

/** Name helpers */
export function categoryLabel(ctx: Ctx, id: string | null): string {
  if (!id) return "Uncategorized";
  if (id === "uncategorized") return "Uncategorized";
  const c = ctx.catIdx.get(id);
  if (!c) return "Uncategorized";
  const p = c.parentId ? ctx.catIdx.get(c.parentId) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
}

export function categoryColor(ctx: Ctx, id: string | null): string {
  return (id && ctx.catIdx.get(id)?.color) || "#94a3b8";
}

export function accountName(ctx: Ctx, id: string | null): string {
  return (id && ctx.accountById.get(id)?.name) || "—";
}
