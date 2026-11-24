import "server-only";
import { db, n } from "./db";
import type { Ctx } from "./data";
import { topCategoryId, incomeOf } from "../finance/ledger";
import { financialYear, fyFromLabel } from "../finance/dates";
import { formatMoney } from "../format";
import { classifyGain, estimateTax, TAX_TEMPLATES, TAX_NOT_MODELLED, type TaxConfig, type TaxEstimate, type TaxInputs } from "../finance/tax";

export interface GainRow {
  holding: string;
  assetClass: string;
  sold: string;
  acquired: string | null;
  gain: number;
  term: "SHORT" | "LONG";
  equity: boolean;
}

export async function taxSummary(ctx: Ctx, fyLabel: string | null) {
  const fy = fyLabel ? { label: fyLabel, ...fyFromLabel(fyLabel, ctx.prefs.fyStartMonth) } : financialYear(ctx.today, ctx.prefs.fyStartMonth);
  const [ruleSets, deductions, tds] = await Promise.all([
    db.taxRuleSet.findMany({ where: { userId: ctx.userId, financialYear: fy.label } }),
    db.taxDeduction.findMany({ where: { userId: ctx.userId, financialYear: fy.label }, orderBy: { date: "asc" } }),
    db.tdsRecord.findMany({ where: { userId: ctx.userId, financialYear: fy.label }, orderBy: { date: "asc" } }),
  ]);

  let salary = 0,
    interest = 0,
    dividends = 0,
    otherIncome = 0,
    exempt = 0;
  for (const t of ctx.txs) {
    if (t.date < fy.from || t.date > fy.to) continue;
    const v = incomeOf(t);
    if (!v) continue;
    const cat = t.categoryId ? ctx.catIdx.get(t.categoryId) : undefined;
    const top = ctx.catIdx.get(topCategoryId(t.categoryId, ctx.catIdx) ?? "");
    if (cat && cat.taxable === false) {
      exempt += v;
      continue;
    }
    if (t.type === "DIVIDEND") dividends += v;
    else if (t.type === "INTEREST" || top?.name === "Interest") interest += v;
    else if (top && ["Salary", "Bonus"].includes(top.name)) salary += v;
    else otherIncome += v;
  }

  const anyConfig: TaxConfig | undefined = ruleSets[0] ? (JSON.parse(ruleSets[0].config) as TaxConfig) : TAX_TEMPLATES[fy.label]?.NEW ?? TAX_TEMPLATES["2025-26"].NEW;
  const gains: GainRow[] = [];
  for (const p of ctx.portfolio.positions)
    for (const l of p.realizedLots) {
      if (l.date < fy.from || l.date > fy.to) continue;
      const c = classifyGain(p.holding.assetClass, l.firstAcquired, l.date, anyConfig);
      gains.push({ holding: p.holding.name, assetClass: p.holding.assetClass, sold: l.date, acquired: l.firstAcquired, gain: l.gain, ...c });
    }
  const sumG = (term: string, equity: boolean) => gains.filter((g) => g.term === term && g.equity === equity).reduce((s, g) => s + g.gain, 0);

  const dedBySection: Record<string, number> = {};
  for (const d of deductions) dedBySection[d.section] = (dedBySection[d.section] ?? 0) + n(d.amount);
  const tdsInvest = ctx.invTxs.filter((t) => t.type === "TAX_WITHHOLDING" && t.date >= fy.from && t.date <= fy.to).reduce((s, t) => s + t.amount, 0);
  const tdsTotal = tds.reduce((s, t) => s + n(t.tdsAmount), 0) + tdsInvest;

  const inputs: TaxInputs = {
    salary,
    otherIncome: interest + dividends + otherIncome,
    stcgEquity: Math.max(0, sumG("SHORT", true)),
    ltcgEquity: Math.max(0, sumG("LONG", true)),
    stcgOther: Math.max(0, sumG("SHORT", false)),
    ltcgOther: Math.max(0, sumG("LONG", false)),
    deductions: dedBySection,
    tdsPaid: tdsTotal,
  };

  const estimates: { regime: string; verified: boolean; id: string | null; config: TaxConfig; result: TaxEstimate }[] = [];
  const notes: string[] = [];
  if (ruleSets.length) {
    for (const r of ruleSets) {
      const config = JSON.parse(r.config) as TaxConfig;
      estimates.push({ regime: r.regime, verified: r.verified, id: r.id, config, result: estimateTax(inputs, config) });
    }
  } else if (TAX_TEMPLATES[fy.label]) {
    for (const regime of ["NEW", "OLD"] as const) {
      const config = TAX_TEMPLATES[fy.label][regime];
      estimates.push({ regime, verified: false, id: null, config, result: estimateTax(inputs, config) });
    }
    notes.push(`Using the built-in FY ${fy.label} template. Save and verify the rules in the Tax rules tab.`);
  } else {
    notes.push(`No tax rules exist for FY ${fy.label}. Rules change between years — add them in the Tax rules tab (start from the latest template and edit).`);
  }
  const losses = gains.filter((g) => g.gain < 0).reduce((s, g) => s + g.gain, 0);
  if (losses < 0) notes.push(`Capital losses of ${formatMoney(-losses, ctx.fmt)} are not set off against gains automatically.`);
  notes.push(`Not modelled: ${TAX_NOT_MODELLED.join("; ")}.`);
  return { fy, inputs, salary, interest, dividends, otherIncome, exempt, gains, deductions, tds, tdsInvest, ruleSets, estimates, notes };
}
