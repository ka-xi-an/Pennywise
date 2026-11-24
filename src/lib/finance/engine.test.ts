import { describe, expect, it } from "vitest";
import type { AccountRec, CategoryRec, TxRec } from "./types";
import { allocate, parseMoney, pct, pctChange, toMajorString, valueOf, roundMinor } from "./money";
import {
  addMonths,
  financialYear,
  monthsInRange,
  parseDateFlexible,
  previousRange,
  resolveRange,
  startOfWeek,
  todayIn,
} from "./dates";
import {
  accountBalances,
  balanceEffects,
  balanceHistory,
  cashFlowStatement,
  expenseOf,
  groupBy,
  incomeOf,
  indexCategories,
  monthlySeries,
  normalizeToBase,
  summarize,
} from "./ledger";
import { makeConverter } from "./fx";
import { buildPortfolio, buildPosition, computeCAGR, rebalance, xirr, type HoldingRec, type InvTxRec } from "./investments";
import { amortize, computeEMI, prepaymentScenario, remainingTenure, splitPayment } from "./loans";
import { budgetStatus, fiftyThirtyTwenty, periodWindow, thresholdLevel, type BudgetRec } from "./budget";
import { annualCost, occurrencesBetween, occurrenceState } from "./recurring";
import { goalProgress, monthsToTarget, requiredMonthly } from "./goals";
import { computeNetWorth } from "./networth";
import { coefficientOfVariation, healthScore, scale } from "./health";
import { retirementPlan, simulate } from "./forecast";
import { classifyGain, estimateTax, slabTax, TAX_TEMPLATES } from "./tax";
import { escapeCell, parseCSV, toCSV } from "./csv";
import { detectAnomalies, detectRecurring } from "./insights";

const R = (rupees: number) => Math.round(rupees * 100);

function acct(id: string, type: AccountRec["type"], opening = 0, openingDate = "2025-01-01", currency = "INR"): AccountRec {
  return {
    id,
    name: id,
    institution: null,
    type,
    currency,
    openingBalance: opening,
    openingDate,
    maskedNumber: null,
    creditLimit: null,
    status: "ACTIVE",
    includeInNetWorth: true,
    isDemo: false,
  };
}

let seq = 0;
function tx(p: Partial<TxRec> & Pick<TxRec, "type" | "amount" | "accountId">): TxRec {
  return {
    id: `t${++seq}`,
    currency: "INR",
    date: "2025-06-15",
    toAccountId: null,
    toAmount: null,
    categoryId: null,
    merchant: null,
    paymentMethod: null,
    description: null,
    principalAmount: null,
    interestAmount: null,
    refundOfId: null,
    isDemo: false,
    ...p,
  };
}

const JUNE = { from: "2025-06-01", to: "2025-06-30" };

describe("money", () => {
  it("parses Indian-formatted amounts to paise exactly", () => {
    expect(parseMoney("1,23,456.78")).toBe(12345678);
    expect(parseMoney("₹ 500")).toBe(50000);
    expect(parseMoney("-12.5")).toBe(-1250);
    expect(parseMoney("(99.99)")).toBe(-9999);
    expect(parseMoney("0.1")).toBe(10);
    expect(parseMoney("0.005")).toBe(1); // half away from zero
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("1.2.3")).toBeNull();
  });
  it("avoids floating-point drift: 0.1 + 0.2 = 0.3", () => {
    expect(parseMoney("0.1")! + parseMoney("0.2")!).toBe(parseMoney("0.3"));
    expect(toMajorString(30)).toBe("0.30");
  });
  it("handles zero-decimal currencies", () => {
    expect(parseMoney("1500", "JPY")).toBe(1500);
  });
  it("computes quantity × price with exact decimals", () => {
    // 12.345 × 678.9012 = 8381.035314 → 838103.5314 paise → rounds to 838104
    expect(valueOf("12.345", "678.9012")).toBe(838104);
    expect(valueOf("0.1", "0.2")).toBe(2); // 0.02 exactly, no float drift
  });
  it("rounds half away from zero symmetrically", () => {
    expect(roundMinor(2.5)).toBe(3);
    expect(roundMinor(-2.5)).toBe(-3);
    expect(Object.is(roundMinor(-0.2), 0)).toBe(true);
  });
  it("allocates remainders so parts sum to total", () => {
    const parts = allocate(100, 3);
    expect(parts).toEqual([34, 33, 33]);
    expect(parts.reduce((a, b) => a + b)).toBe(100);
    expect(allocate(-100, 3).reduce((a, b) => a + b)).toBe(-100);
  });
  it("percentages guard against zero denominators", () => {
    expect(pct(5, 0)).toBeNull();
    expect(pctChange(120, 100)).toBeCloseTo(20);
    expect(pctChange(80, -100)).toBeCloseTo(180);
  });
});

describe("dates", () => {
  it("clamps month-end when adding months", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2025-01-31", 2, 31)).toBe("2025-03-31");
    expect(addMonths("2025-11-15", 3)).toBe("2026-02-15");
    expect(addMonths("2025-03-15", -3)).toBe("2024-12-15");
  });
  it("computes Indian financial year (April–March)", () => {
    expect(financialYear("2025-03-31")).toEqual({ label: "2024-25", from: "2024-04-01", to: "2025-03-31" });
    expect(financialYear("2025-04-01").label).toBe("2025-26");
    expect(financialYear("2025-06-01", 1)).toEqual({ label: "2025", from: "2025-01-01", to: "2025-12-31" });
  });
  it("resolves presets and previous comparable periods", () => {
    const today = "2025-06-18";
    expect(resolveRange("this_month", today)).toMatchObject({ from: "2025-06-01", to: "2025-06-30" });
    expect(resolveRange("last_month", today)).toMatchObject({ from: "2025-05-01", to: "2025-05-31" });
    expect(resolveRange("last_3_months", today)).toMatchObject({ from: "2025-04-01", to: "2025-06-30" });
    expect(resolveRange("this_fy", today)).toMatchObject({ from: "2025-04-01", to: "2026-03-31" });
    expect(previousRange({ from: "2025-04-01", to: "2025-06-30" })).toEqual({ from: "2025-01-01", to: "2025-03-31" });
    expect(previousRange({ from: "2025-06-10", to: "2025-06-19" })).toEqual({ from: "2025-05-31", to: "2025-06-09" });
    expect(resolveRange("custom", today, { from: "2025-07-01", to: "2025-06-01" }).preset).toBe("this_month");
  });
  it("parses flexible import date formats", () => {
    expect(parseDateFlexible("05/03/2025")).toBe("2025-03-05");
    expect(parseDateFlexible("05/03/2025", false)).toBe("2025-05-03");
    expect(parseDateFlexible("5-Mar-25")).toBe("2025-03-05");
    expect(parseDateFlexible("31/02/2025")).toBeNull();
    expect(parseDateFlexible("2025/3/5")).toBe("2025-03-05");
  });
  it("is timezone safe", () => {
    // 20:00 UTC on 31 Mar is already 1 Apr in India
    expect(todayIn("Asia/Kolkata", new Date("2025-03-31T20:00:00Z"))).toBe("2025-04-01");
    expect(todayIn("America/New_York", new Date("2025-03-31T20:00:00Z"))).toBe("2025-03-31");
    expect(startOfWeek("2025-06-15")).toBe("2025-06-09"); // Sunday → Monday
    expect(monthsInRange({ from: "2025-11-20", to: "2026-02-02" })).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("ledger integrity", () => {
  const bank = acct("bank", "SAVINGS", R(10000));
  const wallet = acct("wallet", "WALLET");
  const card = acct("card", "CREDIT_CARD");
  const loan = acct("loan", "LOAN", -R(500000));
  const broker = acct("broker", "INVESTMENT");
  const accounts = [bank, wallet, card, loan, broker];

  const txs: TxRec[] = [
    tx({ type: "INCOME", amount: R(100000), accountId: "bank" }),
    tx({ type: "EXPENSE", amount: R(2000), accountId: "bank", categoryId: "food" }),
    tx({ type: "TRANSFER", amount: R(5000), accountId: "bank", toAccountId: "wallet" }),
    tx({ type: "EXPENSE", amount: R(3000), accountId: "card", categoryId: "shop" }),
    tx({ type: "REFUND", amount: R(1000), accountId: "card", categoryId: "shop" }),
    tx({ type: "TRANSFER", amount: R(2000), accountId: "bank", toAccountId: "card" }), // card bill payment
    tx({ type: "INVESTMENT_BUY", amount: R(20000), accountId: "bank" }),
    tx({ type: "LOAN_REPAYMENT", amount: R(10000), accountId: "bank", toAccountId: "loan", principalAmount: R(6000), interestAmount: R(4000), categoryId: "interest" }),
    tx({ type: "DIVIDEND", amount: R(500), accountId: "broker" }),
    tx({ type: "ADJUSTMENT", amount: -R(100), accountId: "wallet" }),
  ];

  it("transfers never count as income or expense", () => {
    const t = txs[2];
    expect(incomeOf(t)).toBe(0);
    expect(expenseOf(t)).toBe(0);
    expect(balanceEffects(t)).toEqual([
      { accountId: "bank", amount: -R(5000) },
      { accountId: "wallet", amount: R(5000) },
    ]);
  });

  it("investment purchases are not consumption expenses", () => {
    expect(expenseOf(txs[6])).toBe(0);
    expect(incomeOf(txs[6])).toBe(0);
  });

  it("loan repayments split principal (liability) from interest (expense)", () => {
    const t = txs[7];
    expect(expenseOf(t)).toBe(R(4000));
    expect(balanceEffects(t)).toEqual([
      { accountId: "bank", amount: -R(10000) },
      { accountId: "loan", amount: R(6000) },
    ]);
  });

  it("refunds reduce expenses rather than adding income", () => {
    expect(expenseOf(txs[4])).toBe(-R(1000));
    expect(incomeOf(txs[4])).toBe(0);
  });

  it("computes balances as opening + inflows − outflows with paired transfers", () => {
    const b = accountBalances(accounts, txs);
    expect(b.get("bank")).toBe(R(10000 + 100000 - 2000 - 5000 - 2000 - 20000 - 10000));
    expect(b.get("wallet")).toBe(R(5000 - 100));
    expect(b.get("card")).toBe(R(-3000 + 1000 + 2000));
    expect(b.get("loan")).toBe(-R(500000 - 6000));
    expect(b.get("broker")).toBe(R(500));
  });

  it("summarises income, expenses, savings and rates without double counting", () => {
    const s = summarize(txs, JUNE);
    expect(s.income).toBe(R(100500));
    expect(s.expenses).toBe(R(2000 + 3000 - 1000 + 4000));
    expect(s.savings).toBe(R(100500 - 8000));
    expect(s.savingsRate).toBeCloseTo((92500 / 100500) * 100, 6);
    expect(s.expenseRatio).toBeCloseTo((8000 / 100500) * 100, 6);
  });

  it("groups by category including refunds and loan interest", () => {
    const rows = groupBy(txs, JUNE, "category", "expense");
    const get = (k: string) => rows.find((r) => r.key === k)?.amount;
    expect(get("shop")).toBe(R(2000));
    expect(get("interest")).toBe(R(4000));
    expect(get("food")).toBe(R(2000));
  });

  it("produces a cash-flow statement that reconciles to account balances", () => {
    const cf = cashFlowStatement(accounts, txs, JUNE);
    expect(cf.operating.income).toBe(R(100500));
    expect(cf.operating.expenses).toBe(R(8000));
    expect(cf.investing.purchases).toBe(R(20000));
    expect(cf.financing.principalRepaid).toBe(R(6000));
    expect(cf.adjustments).toBe(-R(100));
    expect(cf.reconciles).toBe(true);
    expect(cf.closingCash - cf.openingCash).toBe(cf.netChange);
  });

  it("excludes transactions after the as-of date and opening balances before opening date", () => {
    const late = acct("late", "SAVINGS", R(1000), "2025-07-01");
    expect(accountBalances([late], [], "2025-06-30").get("late")).toBe(0);
    expect(accountBalances([late], [], "2025-07-01").get("late")).toBe(R(1000));
    const hist = balanceHistory(bank, txs, { from: "2025-05-01", to: "2025-06-30" });
    expect(hist[0].balance).toBe(R(10000));
    expect(hist[1].balance).toBe(accountBalances(accounts, txs).get("bank"));
  });

  it("editing/deleting a transaction updates all derived totals consistently", () => {
    const edited = txs.map((t) => (t.id === txs[1].id ? { ...t, amount: R(2500) } : t));
    expect(summarize(edited, JUNE).expenses - summarize(txs, JUNE).expenses).toBe(R(500));
    expect(accountBalances(accounts, edited).get("bank")! - accountBalances(accounts, txs).get("bank")!).toBe(-R(500));
    const deleted = txs.filter((t) => t.id !== txs[2].id);
    expect(accountBalances(accounts, deleted).get("wallet")).toBe(-R(100));
  });

  it("monthly series sums to the period summary", () => {
    const series = monthlySeries(txs, { from: "2025-05-01", to: "2025-06-30" });
    expect(series).toHaveLength(2);
    expect(series[1].income).toBe(summarize(txs, JUNE).income);
  });

  it("converts foreign-currency transactions with user rates and flags missing ones", () => {
    const fx = makeConverter("INR", [{ fromCurrency: "USD", toCurrency: "INR", rate: "83.25", date: "2025-06-01" }]);
    const usd = tx({ type: "EXPENSE", amount: 1000, currency: "USD", accountId: "x" }); // $10.00
    const eur = tx({ type: "EXPENSE", amount: 1000, currency: "EUR", accountId: "x" });
    const { txs: out, unconverted } = normalizeToBase([usd, eur], fx);
    expect(out[0].amount).toBe(83250); // ₹832.50
    expect(unconverted).toHaveLength(1);
    const inv = makeConverter("INR", [{ fromCurrency: "INR", toCurrency: "JPY", rate: "2", date: "2025-01-01" }]);
    expect(inv.convert(100, "JPY", "2025-06-01")).toBe(5000); // ¥100 = ₹50.00
  });
});

describe("investments", () => {
  const h: HoldingRec = {
    id: "h1",
    name: "Fund",
    symbol: null,
    assetClass: "MUTUAL_FUND",
    valuationMode: "UNITS",
    currency: "INR",
    currentPrice: "150",
    currentValue: null,
    priceDate: "2025-12-31",
    priceSource: "MANUAL",
    maturityDate: null,
    interestRate: null,
    accountId: null,
    status: "ACTIVE",
    isDemo: false,
  };
  const itx = (p: Partial<InvTxRec> & Pick<InvTxRec, "type" | "date">): InvTxRec => ({
    id: Math.random().toString(),
    holdingId: "h1",
    quantity: null,
    price: null,
    amount: 0,
    fees: 0,
    ratio: null,
    ...p,
  });

  it("uses average cost for realized and unrealized gains", () => {
    const txs = [
      itx({ type: "BUY", date: "2025-01-01", quantity: "100", price: "100", amount: R(10000) }),
      itx({ type: "BUY", date: "2025-02-01", quantity: "100", price: "120", amount: R(12000) }),
      itx({ type: "SELL", date: "2025-03-01", quantity: "50", price: "130", amount: R(6500) }),
    ];
    const p = buildPosition(h, txs, "2025-12-31");
    expect(p.quantity).toBe("150");
    expect(p.costBasis).toBe(R(16500)); // 22000 − 50 × 110
    expect(p.realized).toBe(R(6500 - 5500));
    expect(p.marketValue).toBe(R(22500));
    expect(p.unrealized).toBe(R(6000));
    expect(p.avgCost).toBe("110");
    expect(p.totalReturn).toBe(R(7000));
  });

  it("handles splits and bonus without changing cost", () => {
    const txs = [
      itx({ type: "BUY", date: "2025-01-01", quantity: "10", amount: R(1000) }),
      itx({ type: "SPLIT", date: "2025-02-01", ratio: "5" }),
      itx({ type: "BONUS", date: "2025-03-01", quantity: "50" }),
    ];
    const p = buildPosition({ ...h, currentPrice: "10" }, txs, "2025-12-31");
    expect(p.quantity).toBe("100");
    expect(p.costBasis).toBe(R(1000));
    expect(p.avgCost).toBe("10");
  });

  it("flags unpriced holdings and values them at cost", () => {
    const p = buildPosition({ ...h, currentPrice: null }, [itx({ type: "BUY", date: "2025-01-01", quantity: "1", amount: R(500) })], "2025-06-01");
    expect(p.priced).toBe(false);
    expect(p.marketValue).toBe(R(500));
    expect(p.xirr).toBeNull();
  });

  it("value-mode holdings (FD) book interest gain on maturity", () => {
    const fd: HoldingRec = { ...h, id: "fd", assetClass: "FIXED_DEPOSIT", valuationMode: "VALUE", currentPrice: null, currentValue: null };
    const txs: InvTxRec[] = [
      { ...itx({ type: "BUY", date: "2024-01-01", amount: R(100000) }), holdingId: "fd" },
      { ...itx({ type: "SELL", date: "2025-01-01", amount: R(107000) }), holdingId: "fd" },
    ];
    const p = buildPosition(fd, txs, "2025-06-01");
    expect(p.realized).toBe(R(7000));
    expect(p.costBasis).toBe(0);
    expect(p.marketValue).toBe(0);
  });

  it("XIRR matches known values", () => {
    // Invest 1000, receive 1100 exactly one year (365 days) later → 10%
    expect(xirr([{ date: "2023-01-01", amount: -1000 }, { date: "2024-01-01", amount: 1100 }])).toBeCloseTo(10, 4);
    // Excel documentation example → 37.336%
    const r = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    expect(r).toBeCloseTo(37.3362535, 3);
    expect(xirr([{ date: "2023-01-01", amount: -1000 }])).toBeNull();
    expect(xirr([{ date: "2023-01-01", amount: 1000 }, { date: "2024-01-01", amount: 1000 }])).toBeNull();
    // losses
    expect(xirr([{ date: "2023-01-01", amount: -1000 }, { date: "2024-01-01", amount: 500 }])).toBeCloseTo(-50, 3);
  });

  it("CAGR uses elapsed time", () => {
    expect(computeCAGR(100, 121, 2)).toBeCloseTo(10, 6);
    expect(computeCAGR(0, 121, 2)).toBeNull();
  });

  it("portfolio aggregates and allocates", () => {
    const pf = buildPortfolio([h], [itx({ type: "BUY", date: "2025-01-01", quantity: "10", amount: R(1000) })], "2025-12-31");
    expect(pf.marketValue).toBe(R(1500));
    expect(pf.allocation[0]).toMatchObject({ assetClass: "MUTUAL_FUND", pct: 100 });
  });

  it("rebalancing deltas sum to zero when targets sum to 100", () => {
    const rows = rebalance(
      [
        { assetClass: "STOCK", value: 7000 },
        { assetClass: "BOND", value: 3000 },
      ],
      { STOCK: 60, BOND: 40 },
    );
    expect(rows.reduce((s, r) => s + r.delta, 0)).toBe(0);
    expect(rows.find((r) => r.assetClass === "STOCK")!.delta).toBe(-1000);
  });
});

describe("loans", () => {
  it("computes EMI with the standard formula", () => {
    // ₹10,00,000 at 10% for 120 months → ₹13,215.074… → rounded up to ₹13,215.08
    expect(computeEMI(R(1000000), 10, 120)).toBe(1321508);
    // a bank-quoted EMI rounded DOWN still closes in 120 months (residual folded into last EMI)
    const s = amortize(R(1000000), 10, 1321507, "2025-01-05");
    expect(s.months).toBe(120);
    expect(s.rows.at(-1)!.closing).toBe(0);
    expect(computeEMI(R(120000), 0, 12)).toBe(R(10000));
  });
  it("amortizes to exactly zero and totals reconcile", () => {
    const s = amortize(R(1000000), 10, computeEMI(R(1000000), 10, 120), "2025-01-05");
    expect(s.months).toBe(120);
    expect(s.rows.at(-1)!.closing).toBe(0);
    const principal = s.rows.reduce((a, r) => a + r.principal, 0);
    expect(principal).toBe(R(1000000));
    expect(s.totalPaid - s.totalInterest).toBe(R(1000000));
    expect(s.rows[0].interest).toBe(R(8333.33));
    expect(s.rows[1].date).toBe("2025-02-05");
  });
  it("detects negative amortization", () => {
    expect(amortize(R(100000), 24, R(1000), "2025-01-01").negativeAmortization).toBe(true);
  });
  it("splits a payment into interest and principal", () => {
    expect(splitPayment(R(100000), 12, R(5000))).toEqual({ interest: R(1000), principal: R(4000), excess: 0 });
  });
  it("prepayment reduces interest and tenure", () => {
    const emi = computeEMI(R(1000000), 9, 240);
    const res = prepaymentScenario(R(1000000), 9, emi, "2025-01-01", R(200000), "REDUCE_TENURE");
    expect(res.interestSaved).toBeGreaterThan(0);
    expect(res.monthsSaved).toBeGreaterThan(0);
    const res2 = prepaymentScenario(R(1000000), 9, emi, "2025-01-01", R(200000), "REDUCE_EMI");
    expect(res2.newEmi!).toBeLessThan(emi);
    expect(res2.monthsSaved).toBe(0);
    expect(remainingTenure(R(1000000), 9, emi)).toBe(240);
  });
});

describe("budgets", () => {
  const cats: CategoryRec[] = [
    { id: "food", name: "Food", kind: "EXPENSE", parentId: null, color: "", essential: true, taxable: false, archived: false },
    { id: "rest", name: "Restaurants", kind: "EXPENSE", parentId: "food", color: "", essential: false, taxable: false, archived: false },
  ];
  const b: BudgetRec = {
    id: "b",
    name: "Monthly",
    period: "MONTHLY",
    method: "CATEGORY",
    startDate: "2025-04-01",
    endDate: null,
    rollover: false,
    expectedIncome: null,
    active: true,
    lines: [{ id: "l", categoryId: "food", amount: R(10000), group: null, isLimit: false }],
  };
  const txs = [
    tx({ type: "EXPENSE", amount: R(3000), accountId: "a", categoryId: "food", date: "2025-06-05" }),
    tx({ type: "EXPENSE", amount: R(4500), accountId: "a", categoryId: "rest", date: "2025-06-10" }),
    tx({ type: "REFUND", amount: R(500), accountId: "a", categoryId: "rest", date: "2025-06-11" }),
    tx({ type: "EXPENSE", amount: R(9000), accountId: "a", categoryId: "food", date: "2025-05-10" }),
  ];
  it("includes subcategories and nets refunds", () => {
    const s = budgetStatus(b, txs, cats, "2025-06-15");
    expect(s.lines[0].actual).toBe(R(7000));
    expect(s.lines[0].remaining).toBe(R(3000));
    expect(s.lines[0].utilization).toBeCloseTo(70);
    expect(s.lines[0].level).toBe("50");
    expect(s.lines[0].dailyAllowance).toBe(Math.floor(R(3000) / 15));
    expect(s.lines[0].projected).toBe(R(14000));
  });
  it("rolls over unspent amounts from previous periods", () => {
    const s = budgetStatus({ ...b, rollover: true }, txs, cats, "2025-06-15");
    // April unspent 10000, May unspent 1000
    expect(s.lines[0].rolloverIn).toBe(R(11000));
    expect(s.lines[0].available).toBe(R(21000));
  });
  it("threshold levels", () => {
    expect(thresholdLevel(49.9)).toBe("ok");
    expect(thresholdLevel(75)).toBe("75");
    expect(thresholdLevel(90.1)).toBe("90");
    expect(thresholdLevel(130)).toBe("100");
  });
  it("period windows", () => {
    expect(periodWindow({ period: "WEEKLY", startDate: "2025-01-01", endDate: null }, "2025-06-15")).toEqual({ from: "2025-06-09", to: "2025-06-15" });
    expect(periodWindow({ period: "ANNUAL", startDate: "2025-04-01", endDate: null }, "2026-02-01")).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(fiftyThirtyTwenty(R(100001))).toEqual({ needs: 5000050, wants: 3000030, savings: 2000020 });
  });
});

describe("recurring, goals, net worth, health, forecasts", () => {
  it("generates month-end-safe occurrences", () => {
    const r = { frequency: "MONTHLY" as const, interval: 1, startDate: "2025-01-31", endDate: null };
    expect(occurrencesBetween(r, "2025-01-01", "2025-04-30")).toEqual(["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30"]);
    expect(annualCost(R(499), { frequency: "MONTHLY", interval: 1 })).toBe(R(5988));
    expect(occurrenceState("2025-06-01", "2025-06-05", undefined, 3)).toBe("OVERDUE");
    expect(occurrenceState("2025-06-07", "2025-06-05", undefined, 3)).toBe("DUE_SOON");
    expect(occurrenceState("2025-06-01", "2025-06-05", "PAID", 3)).toBe("PAID");
  });
  it("goal projections", () => {
    expect(monthsToTarget(0, R(12000), R(1000))).toBe(12);
    expect(requiredMonthly(0, R(12000), 12)).toBe(R(1000));
    expect(requiredMonthly(R(12000), R(12000), 12)).toBe(0);
    expect(monthsToTarget(0, R(12000), 0)).toBeNull();
    const withReturn = monthsToTarget(0, R(100000), R(1000), 12)!;
    expect(withReturn).toBeLessThan(100);
    const g = goalProgress({ targetAmount: R(100000), targetDate: "2026-06-01", monthlyContribution: R(5000), expectedReturn: null }, R(50000), "2025-06-01");
    expect(g.pct).toBe(50);
    expect(g.projectedDate).toBe("2026-04-01");
    expect(g.onTrack).toBe(true);
    expect(g.milestone).toBe(50);
  });
  it("net worth counts every source once", () => {
    const accounts = [acct("bank", "SAVINGS"), acct("card", "CREDIT_CARD"), acct("broker", "INVESTMENT"), acct("usd", "FOREIGN_CURRENCY", 0, "2025-01-01", "USD")];
    const balances = new Map([
      ["bank", R(50000)],
      ["card", -R(10000)],
      ["broker", R(2000)],
      ["usd", 10000],
    ]);
    const fx = makeConverter("INR", []);
    const nw = computeNetWorth({
      accounts,
      balances,
      positions: [],
      assets: [{ id: "a", name: "Flat", type: "REAL_ESTATE", currency: "INR", currentValue: R(5000000) }],
      liabilities: [{ id: "l", name: "IOU", type: "PERSONAL_DEBT", currency: "INR", outstanding: R(1000) }],
      fx,
      today: "2025-06-01",
    });
    expect(nw.totalAssets).toBe(R(50000 + 2000 + 5000000));
    expect(nw.totalLiabilities).toBe(R(11000));
    expect(nw.netWorth).toBe(nw.totalAssets - nw.totalLiabilities);
    expect(nw.warnings[0]).toMatch(/USD/);
    expect(nw.byGroup.INVESTMENT_CASH).toBe(R(2000));
  });
  it("health score is transparent and re-normalises missing components", () => {
    expect(scale(15, 0, 30)).toBe(50);
    expect(scale(5, 50, 10)).toBe(100);
    const h = healthScore({
      savingsRate: 30,
      emergencyMonths: 6,
      debtToIncome: null,
      debtToAsset: null,
      expenseVolatility: null,
      positiveMonthsRatio: null,
      diversification: null,
      goalsOnTrackPct: null,
    });
    expect(h.score).toBe(100);
    expect(healthScore({ savingsRate: 10, emergencyMonths: null, debtToIncome: null, debtToAsset: null, expenseVolatility: null, positiveMonthsRatio: null, diversification: null, goalsOnTrackPct: null }).score).toBeNull();
    expect(coefficientOfVariation([100, 100, 100])).toBe(0);
  });
  it("simulation conserves money with zero returns", () => {
    const s = simulate(
      {
        months: 12,
        startCash: R(100000),
        startInvestments: 0,
        otherAssets: 0,
        otherLiabilities: 0,
        loans: [],
        monthlyIncome: R(50000),
        monthlyExpenses: R(30000),
        monthlyInvestment: R(10000),
        annualReturnPct: 0,
        annualIncomeGrowthPct: 0,
        inflationPct: 0,
        events: [{ month: 6, kind: "PURCHASE", amount: R(20000) }],
      },
      "2025-01-15",
    );
    const last = s.at(-1)!;
    expect(last.cash + last.investments).toBe(R(100000 + 12 * 20000 - 20000));
    expect(last.investments).toBe(R(120000));
  });
  it("retirement plan is internally consistent", () => {
    const p = retirementPlan({
      currentAge: 30,
      retireAge: 60,
      lifeExpectancy: 85,
      monthlyExpensesToday: R(50000),
      inflationPct: 6,
      preReturnPct: 11,
      postReturnPct: 7,
      currentCorpus: R(1000000),
      monthlySip: R(20000),
      sipStepUpPct: 0,
    });
    expect(p.expensesAtRetirement).toBeGreaterThan(R(50000) * 5);
    expect(p.corpusNeeded).toBeGreaterThan(0);
    expect(p.requiredSip).toBeGreaterThan(0);
    expect(p.series).toHaveLength(55);
  });
});

describe("tax (estimates)", () => {
  const NEW = TAX_TEMPLATES["2025-26"].NEW;
  const OLD = TAX_TEMPLATES["2025-26"].OLD;
  it("slab tax", () => {
    expect(slabTax(R(1000000), NEW.slabs)).toBe(R(40000)); // 4L×5% + 2L×10%
    expect(slabTax(R(2500000), NEW.slabs)).toBe(R(20000 + 40000 + 60000 + 80000 + 100000 + 30000));
  });
  it("new regime: ₹12.75L salary → zero tax after std deduction and rebate", () => {
    const e = estimateTax({ salary: R(1275000), otherIncome: 0, stcgEquity: 0, ltcgEquity: 0, stcgOther: 0, ltcgOther: 0, deductions: {}, tdsPaid: 0 }, NEW);
    expect(e.taxableNormalIncome).toBe(R(1200000));
    expect(e.totalTax).toBe(0);
  });
  it("old regime applies capped deductions", () => {
    const e = estimateTax({ salary: R(1000000), otherIncome: 0, stcgEquity: 0, ltcgEquity: 0, stcgOther: 0, ltcgOther: 0, deductions: { "80C": R(200000) }, tdsPaid: R(50000) }, OLD);
    expect(e.deductionsAllowed).toBe(R(150000));
    expect(e.taxableNormalIncome).toBe(R(800000));
    expect(e.slabTax).toBe(R(12500 + 60000));
    expect(e.totalTax).toBe(R(72500 * 1.04));
    expect(e.balancePayable).toBe(e.totalTax - R(50000));
  });
  it("capital gains: LTCG exemption and holding period classification", () => {
    const e = estimateTax({ salary: 0, otherIncome: 0, stcgEquity: R(100000), ltcgEquity: R(225000), stcgOther: 0, ltcgOther: 0, deductions: {}, tdsPaid: 0 }, NEW);
    expect(e.stcgEquityTax).toBe(R(20000));
    expect(e.ltcgEquityTax).toBe(R(12500));
    expect(classifyGain("STOCK", "2024-01-01", "2025-01-15", NEW).term).toBe("LONG");
    expect(classifyGain("STOCK", "2024-06-01", "2025-01-15", NEW).term).toBe("SHORT");
    expect(classifyGain("GOLD", "2024-01-01", "2025-06-01", NEW)).toEqual({ term: "SHORT", equity: false });
  });
});

describe("csv & insights", () => {
  it("parses quoted fields, embedded commas/newlines and BOM", () => {
    const rows = parseCSV('﻿Date,Desc,Amount\r\n01/06/2025,"Swiggy, Bangalore",450\n02/06/2025,"Line1\nLine2","1,200.50"\n');
    expect(rows).toHaveLength(3);
    expect(rows[1][1]).toBe("Swiggy, Bangalore");
    expect(rows[2][1]).toBe("Line1\nLine2");
    expect(rows[2][2]).toBe("1,200.50");
    expect(parseCSV("a;b\n1;2")[1]).toEqual(["1", "2"]);
    expect(parseCSV('a,b\n"he said ""hi""",2')[1][0]).toBe('he said "hi"');
  });
  it("neutralises formula injection but keeps negative numbers", () => {
    expect(escapeCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(escapeCell("-125.50")).toBe("-125.50");
    expect(escapeCell("@SUM")).toBe("'@SUM");
    expect(toCSV(["a"], [["x,y"]], false)).toBe('a\r\n"x,y"\r\n');
  });
  it("detects unusual expenses and recurring charges", () => {
    const hist: TxRec[] = [];
    for (let i = 0; i < 6; i++)
      hist.push(tx({ type: "EXPENSE", amount: R(500 + i * 10), accountId: "a", categoryId: "food", date: addMonths("2025-01-10", i), merchant: "Cafe" }));
    hist.push(tx({ type: "EXPENSE", amount: R(9000), accountId: "a", categoryId: "food", date: "2025-09-20", merchant: "Cafe" }));
    const anomalies = detectAnomalies(hist, "2025-09-25", R(10000));
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].tx.amount).toBe(R(9000));
    const subs: TxRec[] = [0, 1, 2, 3].map((i) =>
      tx({ type: "EXPENSE", amount: R(649), accountId: "a", date: addMonths("2025-01-03", i), merchant: "StreamCo" }),
    );
    const rec = detectRecurring(subs, new Set());
    expect(rec).toHaveLength(1);
    expect(rec[0].averageAmount).toBe(R(649));
    expect(detectRecurring(subs, new Set(["streamco"]))).toHaveLength(0);
  });
});

describe("category roll-up", () => {
  it("topCategory groups subcategories under parents", () => {
    const cats: CategoryRec[] = [
      { id: "food", name: "Food", kind: "EXPENSE", parentId: null, color: "", essential: true, taxable: false, archived: false },
      { id: "rest", name: "Restaurants", kind: "EXPENSE", parentId: "food", color: "", essential: false, taxable: false, archived: false },
    ];
    const rows = groupBy(
      [tx({ type: "EXPENSE", amount: 100, accountId: "a", categoryId: "rest" }), tx({ type: "EXPENSE", amount: 50, accountId: "a", categoryId: "food" })],
      JUNE,
      "topCategory",
      "expense",
      indexCategories(cats),
    );
    expect(rows).toEqual([{ key: "food", amount: 150, count: 2 }]);
  });
});
