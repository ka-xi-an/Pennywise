import "server-only";
import Decimal from "decimal.js";
import { db, big } from "../db";
import { addDays, addMonths, endOfMonth, startOfMonth } from "@/lib/finance/dates";
import { amortize, computeEMI } from "@/lib/finance/loans";
import { valueOf } from "@/lib/finance/money";

/**
 * Demo mode: a year of FICTIONAL but internally consistent records so every module
 * can be explored. Every row is flagged isDemo=true and labelled "Demo" in the UI;
 * instruments use invented names and their prices are tagged priceSource "DEMO"
 * (shown as "Demo price — fictional"). Nothing here represents real market data.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = (rupees: number) => Math.round(rupees * 100);

export async function loadDemoData(userId: string, today: string) {
  const existing = await db.account.count({ where: { userId, isDemo: true } });
  if (existing) throw new Error("Demo data is already loaded");
  const rand = rng(20251124);
  const between = (a: number, b: number) => a + (b - a) * rand();
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

  const cats = await db.category.findMany({ where: { userId } });
  const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;

  const start = addMonths(startOfMonth(today), -12);
  const isDemo = true;

  const mk = (data: Parameters<typeof db.account.create>[0]["data"]) => db.account.create({ data: { ...data, isDemo } as never });
  const salary = await mk({ userId, name: "Demo Salary Account", institution: "Northwind Bank (demo)", type: "SAVINGS", currency: "INR", openingBalance: big(R(120000)), openingDate: start, maskedNumber: "4821" });
  const savings = await mk({ userId, name: "Demo High-Yield Savings", institution: "Harbor Bank (demo)", type: "SAVINGS", currency: "INR", openingBalance: big(R(300000)), openingDate: start, maskedNumber: "1190" });
  const cash = await mk({ userId, name: "Cash Wallet", type: "CASH", currency: "INR", openingBalance: big(R(5000)), openingDate: start });
  const upi = await mk({ userId, name: "Demo UPI Wallet", institution: "Demo Pay", type: "WALLET", currency: "INR", openingBalance: big(R(6000)), openingDate: start });
  const card = await mk({ userId, name: "Demo Rewards Card", institution: "Northwind Bank (demo)", type: "CREDIT_CARD", currency: "INR", openingBalance: big(0), openingDate: start, maskedNumber: "7733", creditLimit: big(R(200000)) });
  const broker = await mk({ userId, name: "Demo Brokerage", institution: "Demo Securities", type: "INVESTMENT", currency: "INR", openingBalance: big(R(15000)), openingDate: start });

  type T = import("@prisma/client").Prisma.TransactionCreateManyInput;
  const txs: T[] = [];
  const cardSpend = new Map<string, number>();
  const walletSpend = new Map<string, number>();
  const add = (t: Omit<T, "userId" | "isDemo" | "currency">) => {
    const rec = t as { type: string; accountId: string; amount: bigint; date: string };
    if (rec.accountId === card.id && rec.type === "EXPENSE")
      cardSpend.set(rec.date.slice(0, 7), (cardSpend.get(rec.date.slice(0, 7)) ?? 0) + Number(rec.amount));
    if (rec.accountId === upi.id && rec.type === "EXPENSE")
      walletSpend.set(rec.date.slice(0, 7), (walletSpend.get(rec.date.slice(0, 7)) ?? 0) + Number(rec.amount));
    txs.push({ ...t, userId, isDemo, currency: "INR" } as T);
  };

  // Home loan (existing): outstanding at start, 8.6% p.a., 228 months remaining.
  const loanOutstanding = R(3500000);
  const loanRate = 8.6;
  const emi = computeEMI(loanOutstanding, loanRate, 228);
  const loanAcc = await mk({ userId, name: "Demo Home Loan", institution: "Harbor Bank (demo)", type: "LOAN", currency: "INR", openingBalance: big(-loanOutstanding), openingDate: start });
  const loan = await db.loan.create({
    data: { userId, accountId: loanAcc.id, name: "Demo Home Loan", lender: "Harbor Bank (demo)", loanType: "HOME", principal: big(R(4200000)), interestRate: "8.6", tenureMonths: 240, startDate: addMonths(start, -12), emi: big(emi), emiDay: 5, isDemo },
  });
  const sched = amortize(loanOutstanding, loanRate, emi, `${start.slice(0, 8)}05`);

  let monthIdx = 0;
  for (let m = start; m <= startOfMonth(today); m = addMonths(m, 1), monthIdx++) {
    const day = (d: number) => {
      const s = `${m.slice(0, 8)}${String(Math.min(d, Number(endOfMonth(m).slice(8)))).padStart(2, "0")}`;
      return s;
    };
    const inPast = (d: string) => d <= today;
    const pay = (d: string, f: () => void) => inPast(d) && f();

    pay(day(1), () => add({ type: "INCOME", amount: big(R(monthIdx >= 9 ? 152000 : 145000)), date: day(1), accountId: salary.id, categoryId: cat("Salary"), merchant: "Acme Analytics Pvt Ltd (demo employer)", paymentMethod: "NEFT_IMPS_RTGS", description: "Monthly salary" }));
    if (monthIdx === 3) pay(day(15), () => add({ type: "INCOME", amount: big(R(60000)), date: day(15), accountId: salary.id, categoryId: cat("Bonus"), merchant: "Acme Analytics Pvt Ltd (demo employer)", description: "Annual performance bonus" }));
    if (monthIdx % 4 === 2) pay(day(12), () => add({ type: "INCOME", amount: big(R(Math.round(between(12000, 25000)))), date: day(12), accountId: salary.id, categoryId: cat("Freelance"), merchant: "Freelance client (demo)", paymentMethod: "UPI", description: "Design consulting" }));

    // Loan EMI with exact amortization split
    const row = sched.rows[monthIdx];
    pay(day(5), () => row && add({ type: "LOAN_REPAYMENT", amount: big(row.payment), date: day(5), accountId: salary.id, toAccountId: loanAcc.id, principalAmount: big(row.principal), interestAmount: big(row.interest), loanId: loan.id, categoryId: cat("Loan interest"), merchant: "Harbor Bank (demo)", paymentMethod: "AUTO_DEBIT", description: "Home loan EMI" }));

    pay(day(3), () => add({ type: "TRANSFER", amount: big(R(20000)), date: day(3), accountId: salary.id, toAccountId: savings.id, description: "Monthly savings transfer", paymentMethod: "NET_BANKING" }));
    // Wallet top-up replaces last month's wallet spending (rounded up to ₹500), so it never runs negative.
    const lastWallet = walletSpend.get(addMonths(m, -1).slice(0, 7)) ?? R(8000);
    const topUp = Math.ceil(lastWallet / R(500)) * R(500) + R(1000);
    pay(day(2), () => add({ type: "TRANSFER", amount: big(topUp), date: day(2), accountId: salary.id, toAccountId: upi.id, description: "Wallet top-up", paymentMethod: "UPI" }));
    pay(day(8), () => add({ type: "TRANSFER", amount: big(R(1500)), date: day(8), accountId: salary.id, toAccountId: cash.id, description: "ATM withdrawal", paymentMethod: "OTHER" }));

    // Utilities & subscriptions
    pay(day(10), () => add({ type: "EXPENSE", amount: big(R(Math.round(between(1700, [4, 5, 6].includes(Number(m.slice(5, 7))) ? 4200 : 2600)))), date: day(10), accountId: salary.id, categoryId: cat("Electricity"), merchant: "City Power Utility (demo)", paymentMethod: "UPI", description: "Electricity bill" }));
    pay(day(7), () => add({ type: "EXPENSE", amount: big(R(999)), date: day(7), accountId: card.id, categoryId: cat("Internet"), merchant: "FiberLink (demo)", paymentMethod: "CREDIT_CARD", description: "Broadband" }));
    pay(day(18), () => add({ type: "EXPENSE", amount: big(R(599)), date: day(18), accountId: card.id, categoryId: cat("Mobile"), merchant: "Telco One (demo)", paymentMethod: "CREDIT_CARD", description: "Postpaid plan" }));
    pay(day(14), () => add({ type: "EXPENSE", amount: big(R(649)), date: day(14), accountId: card.id, categoryId: cat("OTT / streaming"), merchant: "StreamBox (demo)", paymentMethod: "CREDIT_CARD", description: "Streaming subscription" }));
    pay(day(21), () => add({ type: "EXPENSE", amount: big(R(199)), date: day(21), accountId: card.id, categoryId: cat("Software"), merchant: "CloudNote (demo)", paymentMethod: "CREDIT_CARD", description: "Notes app" }));
    pay(day(6), () => add({ type: "EXPENSE", amount: big(R(2500)), date: day(6), accountId: salary.id, categoryId: cat("Maintenance"), merchant: "Lakeview Residents Assoc. (demo)", paymentMethod: "UPI", description: "Society maintenance" }));

    // Variable spending
    const n = (lo: number, hi: number) => Math.round(between(lo, hi));
    for (let i = 0; i < n(4, 6); i++) {
      const d = day(n(1, 28));
      pay(d, () => add({ type: "EXPENSE", amount: big(R(n(900, 4200))), date: d, accountId: pick([upi.id, card.id, salary.id]), categoryId: cat("Groceries"), merchant: pick(["FreshCart (demo)", "Daily Basket (demo)", "Local kirana"]), paymentMethod: pick(["UPI", "CREDIT_CARD", "DEBIT_CARD"]), description: "Groceries" }));
    }
    for (let i = 0; i < n(6, 10); i++) {
      const d = day(n(1, 28));
      pay(d, () => add({ type: "EXPENSE", amount: big(R(n(250, 1600))), date: d, accountId: pick([upi.id, card.id]), categoryId: pick([cat("Restaurants"), cat("Food delivery")]), merchant: pick(["Spice Route (demo)", "QuickBite (demo)", "Cafe Mocha (demo)", "Tandoor House (demo)"]), paymentMethod: pick(["UPI", "CREDIT_CARD"]) }));
    }
    for (let i = 0; i < n(2, 3); i++) {
      const d = day(n(1, 28));
      pay(d, () => add({ type: "EXPENSE", amount: big(R(n(2000, 3400))), date: d, accountId: card.id, categoryId: cat("Fuel"), merchant: "FuelPoint (demo)", paymentMethod: "CREDIT_CARD" }));
    }
    for (let i = 0; i < n(3, 6); i++) {
      const d = day(n(1, 28));
      pay(d, () => add({ type: "EXPENSE", amount: big(R(n(80, 450))), date: d, accountId: pick([cash.id, upi.id]), categoryId: pick([cat("Cabs & auto"), cat("Coffee & snacks"), cat("Public transport")]), merchant: null, paymentMethod: pick(["CASH", "UPI"]) }));
    }
    if (rand() > 0.35) {
      const d = day(n(5, 25));
      pay(d, () => add({ type: "EXPENSE", amount: big(R(n(1500, 7000))), date: d, accountId: card.id, categoryId: pick([cat("Clothing"), cat("Household items"), cat("Electronics")]), merchant: pick(["StyleKart (demo)", "HomeNest (demo)", "GadgetHub (demo)"]), paymentMethod: "CREDIT_CARD" }));
    }
    if (rand() > 0.6) {
      const d = day(n(5, 25));
      pay(d, () => add({ type: "EXPENSE", amount: big(R(n(500, 3500))), date: d, accountId: upi.id, categoryId: pick([cat("Doctor"), cat("Medicines")]), merchant: "CarePlus Clinic (demo)", paymentMethod: "UPI" }));
    }
    if (monthIdx === 4 || monthIdx === 10) {
      const d = day(16);
      pay(d, () => add({ type: "EXPENSE", amount: big(R(n(14000, 26000))), date: d, accountId: card.id, categoryId: cat("Flights"), merchant: "SkyHop Airlines (demo)", paymentMethod: "CREDIT_CARD", description: "Family trip flights" }));
      pay(addDays(d, 1), () => add({ type: "EXPENSE", amount: big(R(n(9000, 18000))), date: addDays(d, 1), accountId: card.id, categoryId: cat("Hotels"), merchant: "Coastal Stays (demo)", paymentMethod: "CREDIT_CARD" }));
    }
    if (monthIdx === 6) {
      pay(day(20), () => add({ type: "EXPENSE", amount: big(R(24500)), date: day(20), accountId: salary.id, categoryId: cat("Health insurance"), merchant: "SecureLife Insurance (demo)", paymentMethod: "NET_BANKING", description: "Annual family floater premium" }));
    }
    // Savings interest quarterly
    if ([2, 5, 8, 11].includes(monthIdx)) pay(day(28), () => add({ type: "INTEREST", amount: big(R(n(4200, 5200))), date: day(28), accountId: savings.id, categoryId: cat("Interest"), merchant: "Harbor Bank (demo)", description: "Savings interest" }));
    // Card bill: pay the previous month's statement in full
    const prevSpend = cardSpend.get(addMonths(m, -1).slice(0, 7)) ?? 0;
    if (monthIdx > 0 && prevSpend > 0)
      pay(day(12), () => add({ type: "TRANSFER", amount: big(prevSpend), date: day(12), accountId: salary.id, toAccountId: card.id, description: "Credit card bill payment", paymentMethod: "NET_BANKING" }));
  }

  // A refund and a recent unusual expense (for anomaly detection)
  const refundDate = addDays(today, -40);
  const shoeExpenseDate = addDays(today, -45);
  txs.push({ userId, isDemo, currency: "INR", type: "EXPENSE", amount: big(R(4999)), date: shoeExpenseDate, accountId: card.id, categoryId: cat("Clothing"), merchant: "StyleKart (demo)", paymentMethod: "CREDIT_CARD", description: "Running shoes" } as T);
  const unusualDate = addDays(today, -6);
  txs.push({ userId, isDemo, currency: "INR", type: "EXPENSE", amount: big(R(9400)), date: unusualDate, accountId: card.id, categoryId: cat("Restaurants"), merchant: "The Grand Terrace (demo)", paymentMethod: "CREDIT_CARD", description: "Anniversary dinner" } as T);

  await db.transaction.createMany({ data: txs as never });
  const shoe = await db.transaction.findFirst({ where: { userId, isDemo, date: shoeExpenseDate, merchant: "StyleKart (demo)", description: "Running shoes" } });
  if (shoe && refundDate <= today)
    await db.transaction.create({ data: { userId, isDemo, currency: "INR", type: "REFUND", amount: big(R(4999)), date: refundDate, accountId: card.id, categoryId: shoe.categoryId, merchant: "StyleKart (demo)", refundOfId: shoe.id, description: "Returned — size issue" } });

  // Investments (fictional instruments, fictional DEMO prices)
  const holding = (data: Record<string, unknown>) => db.investmentHolding.create({ data: { userId, isDemo, priceSource: "DEMO", currency: "INR", ...data } as never });
  const fundA = await holding({ name: "Demo Bluechip Equity Fund – Direct Growth", assetClass: "MUTUAL_FUND", valuationMode: "UNITS", accountId: broker.id });
  const fundB = await holding({ name: "Demo Flexi Cap Fund – Direct Growth", assetClass: "MUTUAL_FUND", valuationMode: "UNITS", accountId: broker.id });
  const etf = await holding({ name: "Demo Nifty-style Index ETF", symbol: "DEMOETF", exchange: "NSE", assetClass: "ETF", valuationMode: "UNITS", accountId: broker.id });
  const stock = await holding({ name: "Demo Infra Industries Ltd", symbol: "DEMOINFRA", exchange: "NSE", assetClass: "STOCK", valuationMode: "UNITS", accountId: broker.id });
  const gold = await holding({ name: "Demo Digital Gold (grams)", assetClass: "GOLD", valuationMode: "UNITS" });
  const fd = await holding({ name: "Demo Bank Fixed Deposit", assetClass: "FIXED_DEPOSIT", valuationMode: "VALUE", interestRate: "7.1", maturityDate: addDays(today, 18) });
  const ppf = await holding({ name: "PPF Account (demo)", assetClass: "PPF", valuationMode: "VALUE", interestRate: "7.1" });

  const invTx = async (h: { id: string }, type: string, date: string, opts: { q?: string; p?: string; amount?: number; fees?: number; ratio?: string; cash?: string | null; ledger?: string; cat?: string | null }) => {
    if (date > today) return;
    const gross = opts.amount ?? (opts.q && opts.p ? valueOf(opts.q, opts.p) : 0);
    let cashId: string | null = null;
    if (opts.cash && opts.ledger) {
      const cashAmt = type === "SELL" ? gross - (opts.fees ?? 0) : opts.ledger === "INVESTMENT_BUY" ? gross + (opts.fees ?? 0) : gross;
      const c = await db.transaction.create({
        data: { userId, isDemo, currency: "INR", type: opts.ledger, amount: big(cashAmt), date, accountId: opts.cash, categoryId: opts.cat ?? null, description: `${type} · ${(h as { name?: string }).name ?? "holding"}`, merchant: (h as { name?: string }).name ?? null, paymentMethod: type === "SIP" ? "AUTO_DEBIT" : null },
      });
      cashId = c.id;
    }
    await db.investmentTransaction.create({
      data: { userId, isDemo, holdingId: h.id, type, date, quantity: opts.q ?? null, price: opts.p ?? null, amount: big(gross), fees: big(opts.fees ?? 0), ratio: opts.ratio ?? null, cashTransactionId: cashId },
    });
  };

  // SIPs with a synthetic NAV path
  let navA = 48.2,
    navB = 92.5;
  for (let i = 0, m = start; m <= startOfMonth(today); m = addMonths(m, 1), i++) {
    navA *= 1 + between(-0.035, 0.05);
    navB *= 1 + between(-0.04, 0.055);
    const d = `${m.slice(0, 8)}07`;
    const qA = new Decimal(10000).div(navA.toFixed(4)).toDecimalPlaces(3, Decimal.ROUND_DOWN).toString();
    const qB = new Decimal(5000).div(navB.toFixed(4)).toDecimalPlaces(3, Decimal.ROUND_DOWN).toString();
    await invTx({ ...fundA }, "SIP", d, { q: qA, p: navA.toFixed(4), cash: salary.id, ledger: "INVESTMENT_BUY" });
    await invTx({ ...fundB }, "SIP", d, { q: qB, p: navB.toFixed(4), cash: salary.id, ledger: "INVESTMENT_BUY" });
  }
  await db.investmentHolding.update({ where: { id: fundA.id }, data: { currentPrice: (navA * 1.012).toFixed(4), priceDate: addDays(today, -1) } });
  await db.investmentHolding.update({ where: { id: fundB.id }, data: { currentPrice: (navB * 0.994).toFixed(4), priceDate: addDays(today, -1) } });

  await invTx(etf, "BUY", addDays(start, 20), { q: "60", p: "231.40", fees: R(20), cash: broker.id, ledger: "INVESTMENT_BUY" });
  await invTx(etf, "BUY", addDays(start, 200), { q: "40", p: "248.10", fees: R(20), cash: salary.id, ledger: "INVESTMENT_BUY" });
  await db.investmentHolding.update({ where: { id: etf.id }, data: { currentPrice: "262.35", priceDate: addDays(today, -1) } });

  await invTx(stock, "BUY", addDays(start, 35), { q: "50", p: "412.00", fees: R(35), cash: salary.id, ledger: "INVESTMENT_BUY" });
  await invTx(stock, "DIVIDEND", addDays(start, 150), { amount: R(450), cash: broker.id, ledger: "DIVIDEND", cat: cat("Dividends") });
  await invTx(stock, "SPLIT", addDays(start, 210), { ratio: "2" });
  await invTx(stock, "SELL", addDays(start, 280), { q: "30", p: "236.50", fees: R(30), cash: broker.id, ledger: "INVESTMENT_SELL" });
  await db.investmentHolding.update({ where: { id: stock.id }, data: { currentPrice: "228.90", priceDate: addDays(today, -1) } });

  await invTx(gold, "BUY", addDays(start, 60), { q: "10", p: "6120", cash: salary.id, ledger: "INVESTMENT_BUY" });
  await invTx(gold, "BUY", addDays(start, 240), { q: "5", p: "6890", cash: salary.id, ledger: "INVESTMENT_BUY" });
  await db.investmentHolding.update({ where: { id: gold.id }, data: { currentPrice: "7240", priceDate: addDays(today, -2) } });

  await invTx(fd, "BUY", addMonths(today, -12 + 0) > start ? addMonths(today, -12) : start, { amount: R(200000) });
  await db.investmentHolding.update({ where: { id: fd.id }, data: { currentValue: big(R(213850)), priceDate: addDays(today, -1) } });
  await invTx(ppf, "BUY", start, { amount: R(420000) }); // opening balance (no cash leg)
  await invTx(ppf, "BUY", addDays(start, 100), { amount: R(150000), cash: salary.id, ledger: "INVESTMENT_BUY" });
  await db.investmentHolding.update({ where: { id: ppf.id }, data: { currentValue: big(R(612400)), priceDate: addDays(today, -30) } });

  // Assets & liabilities (fictional)
  await db.asset.createMany({
    data: [
      { userId, isDemo, name: "Apartment – Lakeview (demo)", type: "REAL_ESTATE", currency: "INR", currentValue: big(R(8500000)), valuationDate: addDays(today, -60), purchaseValue: big(R(6800000)), purchaseDate: "2019-06-15" },
      { userId, isDemo, name: "Family car (demo)", type: "VEHICLE", currency: "INR", currentValue: big(R(620000)), valuationDate: addDays(today, -30), purchaseValue: big(R(950000)), purchaseDate: "2021-03-10" },
    ],
  });
  await db.liability.create({ data: { userId, isDemo, name: "Loan from family (demo)", type: "PERSONAL_DEBT", currency: "INR", outstanding: big(R(50000)), asOfDate: addDays(today, -20) } });

  // Recurring schedules (start at the next due date so they never duplicate history)
  const next = (d: number) => {
    const thisMonth = `${today.slice(0, 8)}${String(d).padStart(2, "0")}`;
    return thisMonth > today ? thisMonth : addMonths(thisMonth, 1);
  };
  const rule = (data: Record<string, unknown>) => db.recurringRule.create({ data: { userId, isDemo, currency: "INR", interval: 1, reminderDays: 3, ...data } as never });
  await rule({ name: "Salary", kind: "INCOME", txType: "INCOME", amount: big(R(152000)), accountId: salary.id, categoryId: cat("Salary"), merchant: "Acme Analytics Pvt Ltd (demo employer)", frequency: "MONTHLY", startDate: next(1), autoPost: true });
  await rule({ name: "Home loan EMI", kind: "EMI", billType: "EMI", txType: "LOAN_REPAYMENT", amount: big(emi), accountId: salary.id, toAccountId: loanAcc.id, loanId: loan.id, categoryId: cat("Loan interest"), frequency: "MONTHLY", startDate: next(5), autoPost: true, paymentMethod: "AUTO_DEBIT" });
  await rule({ name: "Electricity", kind: "BILL", billType: "ELECTRICITY", txType: "EXPENSE", amount: big(R(2400)), accountId: salary.id, categoryId: cat("Electricity"), merchant: "City Power Utility (demo)", frequency: "MONTHLY", startDate: next(10), autoPost: false, reminderDays: 5 });
  await rule({ name: "Broadband", kind: "BILL", billType: "INTERNET", txType: "EXPENSE", amount: big(R(999)), accountId: card.id, categoryId: cat("Internet"), merchant: "FiberLink (demo)", frequency: "MONTHLY", startDate: next(7), autoPost: false });
  await rule({ name: "StreamBox", kind: "SUBSCRIPTION", billType: "OTT", txType: "EXPENSE", amount: big(R(649)), accountId: card.id, categoryId: cat("OTT / streaming"), merchant: "StreamBox (demo)", frequency: "MONTHLY", startDate: next(14), autoPost: false });
  await rule({ name: "CloudNote", kind: "SUBSCRIPTION", billType: "SOFTWARE", txType: "EXPENSE", amount: big(R(199)), accountId: card.id, categoryId: cat("Software"), merchant: "CloudNote (demo)", frequency: "MONTHLY", startDate: next(21), autoPost: false });
  await rule({ name: "Health insurance premium", kind: "BILL", billType: "INSURANCE", txType: "EXPENSE", amount: big(R(24500)), accountId: salary.id, categoryId: cat("Health insurance"), merchant: "SecureLife Insurance (demo)", frequency: "YEARLY", startDate: addMonths(addMonths(start, 6), 12) > today ? addMonths(addMonths(start, 6), 12).slice(0, 8) + "20" : next(20), autoPost: false, reminderDays: 14 });
  await rule({ name: "Credit card bill", kind: "BILL", billType: "CREDIT_CARD", txType: "TRANSFER", amount: big(R(18000)), accountId: salary.id, toAccountId: card.id, frequency: "MONTHLY", startDate: next(12), autoPost: false, reminderDays: 4 });
  await rule({ name: "Monthly savings sweep", kind: "TRANSFER", txType: "TRANSFER", amount: big(R(20000)), accountId: salary.id, toAccountId: savings.id, frequency: "MONTHLY", startDate: next(3), autoPost: true });

  // Budget
  const budget = await db.budget.create({ data: { userId, isDemo, name: "Monthly household budget", period: "MONTHLY", method: "CATEGORY", startDate: addMonths(startOfMonth(today), -3), rollover: false } });
  const lines: [string, number, boolean][] = [
    ["Food", 16000, false],
    ["Transportation", 8000, false],
    ["Utilities", 6000, false],
    ["Shopping", 7000, true],
    ["Entertainment", 2500, false],
    ["Subscriptions", 1200, false],
    ["Healthcare", 3000, false],
  ];
  await db.budgetLine.createMany({ data: lines.filter(([nme]) => cat(nme)).map(([nme, amt, lim]) => ({ budgetId: budget.id, categoryId: cat(nme)!, amount: big(R(amt)), isLimit: lim })) });

  // Goals
  const ef = await db.goal.create({ data: { userId, isDemo, name: "Emergency fund (6 months)", type: "EMERGENCY_FUND", targetAmount: big(R(600000)), targetDate: addMonths(today, 10), priority: 1, monthlyContribution: big(R(20000)), trackingMode: "ACCOUNTS" } });
  await db.goalAccount.create({ data: { goalId: ef.id, accountId: savings.id } });
  const trip = await db.goal.create({ data: { userId, isDemo, name: "Japan vacation", type: "VACATION", targetAmount: big(R(250000)), targetDate: addMonths(today, 14), priority: 2, monthlyContribution: big(R(10000)), trackingMode: "MANUAL", startingAmount: big(R(40000)) } });
  for (let i = 5; i >= 1; i--) await db.goalContribution.create({ data: { goalId: trip.id, date: addMonths(today, -i), amount: big(R(10000)), note: "Monthly set-aside" } });
  await db.goal.create({ data: { userId, isDemo, name: "Net worth ₹1 crore", type: "NET_WORTH", targetAmount: big(R(10000000)), targetDate: addMonths(today, 48), priority: 3, monthlyContribution: big(R(45000)), trackingMode: "NET_WORTH", expectedReturn: "8" } });

  await db.userPreference.update({ where: { userId }, data: { demoMode: true, targetAllocation: JSON.stringify({ MUTUAL_FUND: 45, ETF: 15, STOCK: 10, FIXED_DEPOSIT: 10, PPF: 15, GOLD: 5 }) } });
  return txs.length;
}

/** Removes every demo record; the user's own data is untouched. */
export async function removeDemoData(userId: string) {
  await db.$transaction(async (tx) => {
    await tx.investmentTransaction.deleteMany({ where: { userId, isDemo: true } });
    await tx.recurringOccurrence.deleteMany({ where: { rule: { userId, isDemo: true } } });
    await tx.recurringRule.deleteMany({ where: { userId, isDemo: true } });
    const demoAccounts = (await tx.account.findMany({ where: { userId, isDemo: true }, select: { id: true } })).map((a) => a.id);
    // Delete demo transactions and any real ones that touch demo accounts (they cannot exist without them).
    await tx.recurringOccurrence.deleteMany({ where: { transaction: { userId, OR: [{ isDemo: true }, { accountId: { in: demoAccounts } }, { toAccountId: { in: demoAccounts } }] } } });
    await tx.investmentTransaction.deleteMany({ where: { userId, cashTransaction: { OR: [{ accountId: { in: demoAccounts } }, { toAccountId: { in: demoAccounts } }] } } });
    await tx.transaction.deleteMany({ where: { userId, OR: [{ isDemo: true }, { accountId: { in: demoAccounts } }, { toAccountId: { in: demoAccounts } }] } });
    await tx.investmentHolding.deleteMany({ where: { userId, isDemo: true } });
    await tx.loan.deleteMany({ where: { userId, isDemo: true } });
    await tx.account.deleteMany({ where: { userId, isDemo: true } });
    await tx.budget.deleteMany({ where: { userId, isDemo: true } });
    await tx.goal.deleteMany({ where: { userId, isDemo: true } });
    await tx.asset.deleteMany({ where: { userId, isDemo: true } });
    await tx.liability.deleteMany({ where: { userId, isDemo: true } });
    await tx.netWorthSnapshot.deleteMany({ where: { userId } }); // derived; rebuilt from real data
    await tx.notification.deleteMany({ where: { userId } });
    await tx.userPreference.update({ where: { userId }, data: { demoMode: false } });
  });
}
