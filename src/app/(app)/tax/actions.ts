"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { checkbox, isoDate, money, optStr } from "@/lib/validation";
import { parseMoney } from "@/lib/finance/money";
import { TAX_TEMPLATES, type TaxConfig } from "@/lib/finance/tax";

const fyStr = z.string().regex(/^\d{4}(-\d{2})?$/, "Invalid financial year");

const dedSchema = z.object({
  financialYear: fyStr,
  section: z.enum(["80C", "80CCD1B", "80CCD2", "80D", "80E", "80G", "80TTA", "24B", "HRA", "OTHER"]),
  description: z.string().trim().min(1, "Describe the deduction").max(200),
  amount: money("Amount", { positive: true }),
  date: isoDate(),
  notes: optStr(500),
});

export async function saveDeduction(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(dedSchema, fd);
    if (p.error) return p.error;
    await db.taxDeduction.create({ data: { ...p.data, amount: big(p.data.amount), userId: user.id } });
    revalidateAll();
    return ok("Deduction recorded");
  });
}

export async function deleteDeduction(id: string) {
  const user = await requireUser();
  await db.taxDeduction.deleteMany({ where: { id, userId: user.id } });
  revalidateAll();
  return ok("Deduction removed");
}

const tdsSchema = z.object({
  financialYear: fyStr,
  deductor: z.string().trim().min(1, "Deductor is required").max(120),
  tan: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((v) => !v || /^[A-Z]{4}\d{5}[A-Z]$/.test(v), "TAN format: ABCD12345E")
    .transform((v) => v || null),
  incomeType: z.enum(["SALARY", "INTEREST", "DIVIDEND", "RENT", "PROFESSIONAL", "OTHER"]),
  grossAmount: money("Gross amount", { positive: true }),
  tdsAmount: money("TDS amount", { positive: true }),
  date: isoDate(),
  notes: optStr(500),
});

export async function saveTds(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(tdsSchema, fd);
    if (p.error) return p.error;
    if (p.data.tdsAmount > p.data.grossAmount) return fail("TDS can't exceed the gross amount", { tdsAmount: "Too large" });
    await db.tdsRecord.create({ data: { ...p.data, grossAmount: big(p.data.grossAmount), tdsAmount: big(p.data.tdsAmount), userId: user.id } });
    revalidateAll();
    return ok("TDS entry recorded");
  });
}

export async function deleteTds(id: string) {
  const user = await requireUser();
  await db.tdsRecord.deleteMany({ where: { id, userId: user.id } });
  revalidateAll();
  return ok("TDS entry removed");
}

const pct = (label: string) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .min(0)
    .max(100);
const rupees = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const m = parseMoney(v || "0");
      if (m == null || m < 0) {
        ctx.addIssue({ code: "custom", message: `${label} must be an amount` });
        return z.NEVER;
      }
      return m;
    });

const ruleSchema = z.object({
  financialYear: fyStr,
  regime: z.enum(["NEW", "OLD"]),
  slabs: z.string().min(1, "Enter at least one slab"),
  standardDeduction: rupees("Standard deduction"),
  rebateIncomeLimit: rupees("Rebate income limit"),
  rebateMax: rupees("Maximum rebate"),
  cessPct: pct("Cess"),
  deductionsAllowed: checkbox,
  deductionCaps: z.string().optional(),
  stcgEquityPct: pct("STCG rate"),
  ltcgEquityPct: pct("LTCG rate"),
  ltcgEquityExemption: rupees("LTCG exemption"),
  equityLtcgMonths: z.coerce.number().int().min(1).max(120),
  otherLtcgMonths: z.coerce.number().int().min(1).max(240),
  otherLtcgPct: pct("Other LTCG rate"),
  verified: checkbox,
  notes: optStr(1000),
});

/**
 * Slabs are entered one per line as "upper limit in ₹, rate %"; the last line uses
 * "above" (or is blank) as the upper limit. Example: "400000, 0" … "above, 30".
 */
export async function saveRuleSet(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(ruleSchema, fd);
    if (p.error) return p.error;
    const d = p.data;
    const slabs: TaxConfig["slabs"] = [];
    for (const [i, line] of d.slabs.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).entries()) {
      const [lim, rate] = line.split(",").map((x) => x.trim());
      const r = Number(rate);
      if (!Number.isFinite(r) || r < 0 || r > 100) return fail(`Slab line ${i + 1}: rate must be 0–100`, { slabs: "Invalid rate" });
      const upTo = !lim || /^above|^max|^-$/i.test(lim) ? null : parseMoney(lim);
      if (upTo === undefined || (lim && !/^above|^max|^-$/i.test(lim) && upTo == null)) return fail(`Slab line ${i + 1}: invalid limit`, { slabs: "Invalid limit" });
      slabs.push({ upTo, ratePct: r });
    }
    for (let i = 1; i < slabs.length; i++) if (slabs[i - 1].upTo == null || (slabs[i].upTo != null && slabs[i].upTo! <= slabs[i - 1].upTo!)) return fail("Slab limits must increase and only the last may be open-ended", { slabs: "Order" });
    if (slabs.at(-1)!.upTo != null) slabs.push({ upTo: null, ratePct: slabs.at(-1)!.ratePct });
    const caps: Record<string, number> = {};
    for (const line of (d.deductionCaps ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const [sec, amt] = line.split(",").map((x) => x.trim());
      const m = parseMoney(amt ?? "");
      if (!sec || m == null) return fail(`Invalid deduction cap line “${line}” (use: 80C, 150000)`, { deductionCaps: "Invalid" });
      caps[sec.toUpperCase()] = m;
    }
    const config: TaxConfig = {
      slabs,
      standardDeduction: d.standardDeduction,
      rebateIncomeLimit: d.rebateIncomeLimit,
      rebateMax: d.rebateMax,
      cessPct: d.cessPct,
      deductionsAllowed: d.deductionsAllowed,
      deductionCaps: caps,
      stcgEquityPct: d.stcgEquityPct,
      ltcgEquityPct: d.ltcgEquityPct,
      ltcgEquityExemption: d.ltcgEquityExemption,
      equityLtcgMonths: d.equityLtcgMonths,
      otherLtcgMonths: d.otherLtcgMonths,
      otherLtcgPct: d.otherLtcgPct,
    };
    await db.taxRuleSet.upsert({
      where: { userId_financialYear_regime: { userId: user.id, financialYear: d.financialYear, regime: d.regime } },
      create: { userId: user.id, financialYear: d.financialYear, regime: d.regime, config: JSON.stringify(config), verified: d.verified, notes: d.notes },
      update: { config: JSON.stringify(config), verified: d.verified, notes: d.notes },
    });
    await audit(user.id, "tax.rules_save", "TaxRuleSet", null, { fy: d.financialYear, regime: d.regime, verified: d.verified });
    revalidateAll();
    return ok(`FY ${d.financialYear} ${d.regime.toLowerCase()}-regime rules saved`);
  });
}

/** Copy a template (or another year's saved rules) into a new FY as an UNVERIFIED starting point. */
export async function copyRules(targetFy: string, source: string) {
  const user = await requireUser();
  return run(async () => {
    if (!/^\d{4}-\d{2}$/.test(targetFy)) return fail("Invalid financial year");
    let configs: Record<string, TaxConfig> = {};
    if (source.startsWith("template:")) configs = TAX_TEMPLATES[source.slice(9)] ?? {};
    else {
      const rows = await db.taxRuleSet.findMany({ where: { userId: user.id, financialYear: source } });
      configs = Object.fromEntries(rows.map((r) => [r.regime, JSON.parse(r.config) as TaxConfig]));
    }
    if (!Object.keys(configs).length) return fail("Nothing to copy");
    for (const [regime, config] of Object.entries(configs)) {
      await db.taxRuleSet.upsert({
        where: { userId_financialYear_regime: { userId: user.id, financialYear: targetFy, regime } },
        create: { userId: user.id, financialYear: targetFy, regime, config: JSON.stringify(config), verified: false, notes: `Copied from ${source} — verify against official sources for FY ${targetFy}.` },
        update: {},
      });
    }
    revalidateAll();
    return ok(`Rules copied to FY ${targetFy} — review and mark them verified`);
  });
}

export async function deleteRuleSet(id: string) {
  const user = await requireUser();
  await db.taxRuleSet.deleteMany({ where: { id, userId: user.id } });
  revalidateAll();
  return ok("Rules removed");
}
