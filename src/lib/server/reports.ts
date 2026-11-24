import "server-only";
import type { Ctx } from "./data";
import { categoryLabel, accountName } from "./data";
import { loadBudgets } from "./budgets";
import { loadSnapshots } from "./services/snapshots";
import { accountBalances, cashFlowStatement, essentialSplit, groupBy, monthlySeries, summarize, topCategoryId } from "../finance/ledger";
import { buildPortfolio, ASSET_CLASS_LABELS } from "../finance/investments";
import { computeNetWorth, NW_GROUP_LABELS, type NWGroup } from "../finance/networth";
import { budgetStatus } from "../finance/budget";
import { amortize, nextEmiDate } from "../finance/loans";
import { monthLabel, monthsInRange } from "../finance/dates";
import { ACCOUNT_TYPE_LABELS, type DateRange } from "../finance/types";
import { taxSummary } from "./tax";

export type Cell = string | { money: number } | { pct: number | null } | { num: string };
export interface ReportSection {
  title?: string;
  rows: Cell[][];
  total?: Cell[];
}
export interface Report {
  id: string;
  title: string;
  subtitle: string;
  columns: string[];
  sections: ReportSection[];
  notes: string[];
  asOf?: boolean;
}

export const REPORTS = [
  { id: "income-statement", label: "Personal income statement" },
  { id: "balance-sheet", label: "Personal balance sheet" },
  { id: "cash-flow", label: "Cash-flow statement" },
  { id: "expense-monthly", label: "Monthly expense report" },
  { id: "expense-annual", label: "Annual expense report" },
  { id: "budget", label: "Budget performance" },
  { id: "net-worth", label: "Net worth statement" },
  { id: "investments", label: "Investment performance" },
  { id: "debt", label: "Debt report" },
  { id: "savings", label: "Savings report" },
  { id: "tax", label: "Tax summary (estimate)" },
] as const;
export type ReportId = (typeof REPORTS)[number]["id"];

const M = (v: number): Cell => ({ money: v });
const P = (v: number | null): Cell => ({ pct: v });

export async function buildReport(ctx: Ctx, id: string, range: DateRange): Promise<Report> {
  const period = `${range.from} → ${range.to}`;
  switch (id) {
    case "balance-sheet": {
      const asOf = range.to > ctx.today ? ctx.today : range.to;
      const isToday = asOf === ctx.today;
      const balances = accountBalances(ctx.accounts, ctx.txsNative, asOf);
      const pf = isToday ? ctx.portfolio : buildPortfolio(ctx.holdings.map((h) => ({ ...h, currentPrice: null, currentValue: null })), ctx.invTxs.filter((t) => t.date <= asOf), asOf);
      const nw = computeNetWorth({
        accounts: ctx.accounts.filter((a) => a.openingDate <= asOf),
        balances,
        positions: pf.positions,
        assets: ctx.assets.filter((a) => a.valuationDate <= asOf || isToday),
        liabilities: ctx.liabilities.filter((l) => l.asOfDate <= asOf || isToday),
        fx: ctx.fx,
        today: asOf,
      });
      const bySection = (items: typeof nw.assets) => {
        const groups = new Map<NWGroup, typeof items>();
        for (const i of items) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
        return [...groups.entries()].map(([g, list]) => ({ title: NW_GROUP_LABELS[g], rows: list.map((i) => [i.name + (i.flag ? ` (${i.flag})` : ""), M(i.value)]), total: [`Total ${NW_GROUP_LABELS[g].toLowerCase()}`, M(list.reduce((s, i) => s + i.value, 0))] as Cell[] }));
      };
      return {
        id,
        title: "Personal balance sheet",
        subtitle: `As of ${asOf}`,
        asOf: true,
        columns: ["Item", "Amount"],
        sections: [
          { title: "ASSETS", rows: [] },
          ...bySection(nw.assets),
          { rows: [], total: ["TOTAL ASSETS", M(nw.totalAssets)] },
          { title: "LIABILITIES", rows: [] },
          ...bySection(nw.liabilities),
          { rows: [], total: ["TOTAL LIABILITIES", M(nw.totalLiabilities)] },
          { rows: [["Debt-to-asset ratio", P(nw.debtToAsset)]], total: ["NET WORTH", M(nw.netWorth)] },
        ],
        notes: [
          ...nw.warnings,
          isToday ? "Investments at the latest entered prices (see each holding's price date)." : "Past date: investments are valued at cost because historical prices are not stored.",
          "Account balances are opening balance plus all transactions up to the date.",
        ],
      };
    }
    case "cash-flow": {
      const base = ctx.accounts.filter((a) => a.currency === ctx.prefs.baseCurrency);
      const cf = cashFlowStatement(base, ctx.txs, range);
      return {
        id,
        title: "Cash-flow statement",
        subtitle: period,
        columns: ["", "Amount"],
        sections: [
          { rows: [["Opening cash & equivalents", M(cf.openingCash)]] },
          { title: "Operating activities", rows: [["Income received", M(cf.operating.income)], ["Expenses paid (incl. loan interest, net of refunds)", M(-cf.operating.expenses)]], total: ["Net operating cash flow", M(cf.operating.net)] },
          { title: "Investing activities", rows: [["Investments purchased", M(-cf.investing.purchases)], ["Investments sold / redeemed", M(cf.investing.sales)]], total: ["Net investing cash flow", M(cf.investing.net)] },
          { title: "Financing activities", rows: [["Loans received", M(cf.financing.borrowings)], ["Loan principal repaid", M(-cf.financing.principalRepaid)]], total: ["Net financing cash flow", M(cf.financing.net)] },
          { rows: [["Balance adjustments", M(cf.adjustments)], ["Opening balances of new accounts", M(cf.newAccountOpenings)]], total: ["Net change in cash", M(cf.netChange)] },
          { rows: [["Closing cash & equivalents", M(cf.closingCash)], ["Reconciles to account balances", cf.reconciles ? "Yes" : "No — check foreign-currency accounts"]] },
        ],
        notes: ["Cash & equivalents = all accounts except loans (credit cards count as negative cash).", "Transfers between your own cash accounts net to zero and are excluded.", `Only ${ctx.prefs.baseCurrency} accounts are included.`],
      };
    }
    case "expense-monthly":
    case "expense-annual": {
      const annual = id === "expense-annual";
      const keys = annual ? [...new Set(monthsInRange(range).map((m) => m.slice(0, 4)))] : monthsInRange(range).slice(-12);
      const totals = groupBy(ctx.txs, range, "topCategory", "expense", ctx.catIdx);
      const cell = new Map<string, number>();
      for (const t of ctx.txs) {
        if (t.date < range.from || t.date > range.to) continue;
        const v = t.type === "EXPENSE" ? t.amount : t.type === "REFUND" ? -t.amount : t.type === "LOAN_REPAYMENT" ? t.interestAmount ?? 0 : 0;
        if (!v) continue;
        const k = `${topCategoryId(t.categoryId, ctx.catIdx) ?? "uncategorized"}|${annual ? t.date.slice(0, 4) : t.date.slice(0, 7)}`;
        cell.set(k, (cell.get(k) ?? 0) + v);
      }
      const colTotals = keys.map((k) => totals.reduce((s, c) => s + (cell.get(`${c.key}|${k}`) ?? 0), 0));
      return {
        id,
        title: annual ? "Annual expense report" : "Monthly expense report",
        subtitle: period,
        columns: ["Category", ...keys.map((k) => (annual ? k : monthLabel(k))), "Total"],
        sections: [
          {
            rows: totals.map((c) => [categoryLabel(ctx, c.key), ...keys.map((k) => M(cell.get(`${c.key}|${k}`) ?? 0)), M(c.amount)]),
            total: ["Total", ...colTotals.map(M), M(totals.reduce((s, c) => s + c.amount, 0))],
          },
        ],
        notes: ["Net of refunds; includes loan interest; excludes transfers, investments and loan principal."],
      };
    }
    case "budget": {
      const budgets = (await loadBudgets(ctx.userId)).filter((b) => b.active);
      return {
        id,
        title: "Budget performance report",
        subtitle: "Current period of each active budget",
        columns: ["Category", "Planned", "Actual", "Variance", "Used"],
        sections: budgets.map((b) => {
          const s = budgetStatus(b, ctx.txs, ctx.categories, ctx.today);
          return {
            title: `${b.name} (${s.window.from} → ${s.window.to})`,
            rows: s.lines.map((l) => [categoryLabel(ctx, l.categoryId), M(l.available), M(l.actual), M(l.available - l.actual), P(l.utilization)]),
            total: ["Total", M(s.available), M(s.actual), M(s.available - s.actual), P(s.utilization)],
          };
        }),
        notes: budgets.length ? ["Variance = planned (incl. rollover) − actual. Negative means overspent."] : ["No active budgets."],
      };
    }
    case "net-worth": {
      const snaps = await loadSnapshots(ctx.userId);
      return {
        id,
        title: "Net worth statement",
        subtitle: `Month-end snapshots · current ${ctx.today}`,
        columns: ["Month", "Assets", "Liabilities", "Net worth", "Source"],
        sections: [
          {
            rows: snaps.map((s) => [monthLabel(s.date.slice(0, 7)), M(Number(s.totalAssets)), M(Number(s.totalLiabilities)), M(Number(s.netWorth)), s.source === "BACKFILLED" ? "Estimated" : "Recorded"]),
            total: ["Today", M(ctx.netWorth.totalAssets), M(ctx.netWorth.totalLiabilities), M(ctx.netWorth.netWorth), "Live"],
          },
        ],
        notes: ["Estimated months value investments at cost."],
      };
    }
    case "investments": {
      const pf = ctx.portfolio;
      return {
        id,
        title: "Investment performance report",
        subtitle: `As of ${ctx.today}`,
        asOf: true,
        columns: ["Holding", "Class", "Invested", "Value", "Unrealized", "Realized", "Payouts", "XIRR"],
        sections: [
          {
            rows: pf.positions
              .filter((p) => p.totalInvested > 0)
              .map((p) => [p.holding.name + (p.priced ? "" : " (at cost)"), ASSET_CLASS_LABELS[p.holding.assetClass], M(p.costBasis), M(p.marketValue), M(p.unrealized), M(p.realized), M(p.dividends), P(p.xirr)]),
            total: ["Portfolio", "", M(pf.invested), M(pf.marketValue), M(pf.unrealized), M(pf.realized), M(pf.dividends), P(pf.xirr)],
          },
        ],
        notes: ["Average-cost method. Prices are manually entered or from a configured provider, never estimated.", ctx.holdings.some((h) => h.priceSource === "DEMO") ? "Demo holdings use fictional prices." : ""].filter(Boolean),
      };
    }
    case "debt": {
      const rows: Cell[][] = ctx.loans.map((l) => {
        const s = amortize(l.outstanding, Number(l.interestRate), l.emi, nextEmiDate(ctx.today, l.emiDay));
        return [l.name, "Loan", M(l.outstanding), `${l.interestRate}%`, M(l.emi), M(s.totalInterest), s.payoffDate ?? "—"];
      });
      for (const a of ctx.accounts.filter((x) => x.type === "CREDIT_CARD")) {
        const owed = Math.max(0, -(ctx.balances.get(a.id) ?? 0));
        if (owed) rows.push([a.name, "Credit card", M(owed), "—", "—", "—", "—"]);
      }
      for (const l of ctx.liabilities) rows.push([l.name, "Other", M(l.outstanding), l.interestRate ? `${l.interestRate}%` : "—", "—", "—", "—"]);
      return {
        id,
        title: "Debt report",
        subtitle: `As of ${ctx.today}`,
        asOf: true,
        columns: ["Debt", "Type", "Outstanding", "Rate", "EMI", "Interest remaining", "Payoff"],
        sections: [{ rows, total: ["Total", "", M(ctx.netWorth.totalLiabilities), "", M(ctx.loans.reduce((s, l) => s + (l.outstanding > 0 ? l.emi : 0), 0)), "", ""] }],
        notes: ["Interest remaining assumes current rate and EMI."],
      };
    }
    case "savings": {
      const series = monthlySeries(ctx.txs, range);
      const s = summarize(ctx.txs, range);
      return {
        id,
        title: "Savings report",
        subtitle: period,
        columns: ["Month", "Income", "Expenses", "Savings", "Savings rate"],
        sections: [{ rows: series.map((m) => [monthLabel(m.month), M(m.income), M(m.expenses), M(m.savings), P(m.income ? (m.savings / m.income) * 100 : null)]), total: ["Total", M(s.income), M(s.expenses), M(s.savings), P(s.savingsRate)] }],
        notes: ["Savings = income − expenses. Money moved to investments is part of savings, not spending."],
      };
    }
    case "tax": {
      const t = await taxSummary(ctx, null);
      return {
        id,
        title: `Tax summary — FY ${t.fy.label}`,
        subtitle: `${t.fy.from} → ${t.fy.to} · ESTIMATE, not an official computation`,
        columns: ["Item", "Amount"],
        sections: [
          { title: "Income", rows: [["Salary", M(t.inputs.salary)], ["Interest", M(t.interest)], ["Dividends", M(t.dividends)], ["Other taxable income", M(t.otherIncome)], ["Exempt income (not taxed)", M(t.exempt)]] },
          { title: "Capital gains", rows: [["Short-term — equity", M(t.inputs.stcgEquity)], ["Long-term — equity", M(t.inputs.ltcgEquity)], ["Short-term — other (slab)", M(t.inputs.stcgOther)], ["Long-term — other", M(t.inputs.ltcgOther)]] },
          { title: "Deductions & TDS", rows: [...Object.entries(t.inputs.deductions).map(([k, v]) => [k, M(v)] as Cell[]), ["TDS deducted", M(t.inputs.tdsPaid)]] },
          ...t.estimates.map((e) => ({
            title: `${e.regime === "NEW" ? "New" : "Old"} regime${e.verified ? "" : " (rules not yet verified by you)"}`,
            rows: [["Taxable income (normal rates)", M(e.result.taxableNormalIncome)], ["Tax before cess", M(e.result.taxBeforeCess)], ["Cess", M(e.result.cess)]] as Cell[][],
            total: ["Estimated tax · balance after TDS", M(e.result.balancePayable)] as Cell[],
          })),
        ],
        notes: ["Planning estimate using the tax rules saved in Tax Center. Verify with a tax professional or the official portal before filing.", ...t.notes],
      };
    }
    case "income-statement":
    default: {
      const s = summarize(ctx.txs, range);
      const inc = groupBy(ctx.txs, range, "topCategory", "income", ctx.catIdx);
      const exp = groupBy(ctx.txs, range, "topCategory", "expense", ctx.catIdx);
      const split = essentialSplit(ctx.txs, range, ctx.catIdx);
      const realized = ctx.portfolio.positions.flatMap((p) => p.realizedLots).filter((l) => l.date >= range.from && l.date <= range.to).reduce((a, l) => a + l.gain, 0);
      return {
        id: "income-statement",
        title: "Personal income statement",
        subtitle: period,
        columns: ["", "Amount", "Share"],
        sections: [
          { title: "Income", rows: inc.map((r) => [categoryLabel(ctx, r.key), M(r.amount), P(s.income ? (r.amount / s.income) * 100 : null)]), total: ["Total income", M(s.income), P(100)] },
          {
            title: "Expenses",
            rows: exp.map((r) => [categoryLabel(ctx, r.key), M(r.amount), P(s.expenses ? (r.amount / s.expenses) * 100 : null)]),
            total: ["Total expenses", M(s.expenses), P(s.income ? (s.expenses / s.income) * 100 : null)],
          },
          { rows: [["Essential expenses", M(split.essential), P(null)], ["Discretionary expenses", M(split.discretionary), P(null)]] },
          { rows: [["Savings rate", P(s.savingsRate), ""]], total: ["NET SAVINGS (income − expenses)", M(s.savings), P(s.savingsRate)] },
          { title: "Memo (not included above)", rows: [["Realized capital gains", M(realized), ""]] },
        ],
        notes: [
          "Income includes dividends and interest. Expenses are net of refunds and include loan interest.",
          "Transfers, investment purchases/sales and loan principal are balance-sheet movements and are excluded.",
          ...(ctx.unconverted.length ? [`${ctx.unconverted.length} foreign-currency transaction(s) without an exchange rate are excluded.`] : []),
          `Accounts: ${ctx.accounts.length} (${[...new Set(ctx.accounts.map((a) => ACCOUNT_TYPE_LABELS[a.type]))].join(", ")}).`,
        ],
      };
    }
  }
}

/** Custom report: group a measure over a range with filters. */
export function customReport(
  ctx: Ctx,
  range: DateRange,
  opts: { groupBy: string; measure: "expense" | "income"; account?: string; category?: string },
): Report {
  let txs = ctx.txs;
  if (opts.account) txs = txs.filter((t) => t.accountId === opts.account);
  if (opts.category) {
    const ids = new Set([opts.category, ...ctx.categories.filter((c) => c.parentId === opts.category).map((c) => c.id)]);
    txs = txs.filter((t) => t.categoryId && ids.has(t.categoryId));
  }
  const by = (["category", "topCategory", "merchant", "paymentMethod", "account", "month", "week", "day"].includes(opts.groupBy) ? opts.groupBy : "topCategory") as Parameters<typeof groupBy>[2];
  const rows = groupBy(txs, range, by, opts.measure, ctx.catIdx);
  if (by === "month" || by === "week" || by === "day") rows.sort((a, b) => a.key.localeCompare(b.key));
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const label = (k: string) => (by === "category" || by === "topCategory" ? categoryLabel(ctx, k) : by === "account" ? accountName(ctx, k) : by === "month" ? monthLabel(k) : k);
  return {
    id: "custom",
    title: `${opts.measure === "expense" ? "Spending" : "Income"} by ${by.replace("topCategory", "category").replace("paymentMethod", "payment method")}`,
    subtitle: `${range.from} → ${range.to}`,
    columns: ["Group", "Amount", "Transactions", "Share"],
    sections: [{ rows: rows.map((r) => [label(r.key), M(r.amount), { num: String(r.count) }, P(total ? (r.amount / total) * 100 : null)]), total: ["Total", M(total), { num: String(rows.reduce((s, r) => s + r.count, 0)) }, P(100)] }],
    notes: [],
  };
}
