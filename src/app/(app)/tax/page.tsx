import { Suspense } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { pageCtx, param, type SP } from "@/lib/server/page";
import { taxSummary } from "@/lib/server/tax";
import { db } from "@/lib/server/db";
import { financialYear, addDays } from "@/lib/finance/dates";
import { DEDUCTION_SECTIONS, TAX_TEMPLATES, type TaxConfig } from "@/lib/finance/tax";
import { ASSET_CLASS_LABELS } from "@/lib/finance/investments";
import { formatDate, formatMoney, minorToInput } from "@/lib/format";
import { Badge, Card, CardHeader, KV, Notice, PageHeader, Stat, Table, Tabs, Td, Th } from "@/components/ui/core";
import { ActionButton, ConfirmAction, ModalForm } from "@/components/ui/modal";
import { ActionForm, Checkbox, Field, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { ParamSelect } from "@/components/range-picker";
import { Attachments } from "@/components/attachments";
import { copyRules, deleteDeduction, deleteRuleSet, deleteTds, saveDeduction, saveRuleSet, saveTds } from "./actions";

export const metadata = { title: "Tax Center" };

export default async function TaxPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await pageCtx();
  const tab = param(sp, "tab") ?? "summary";
  const current = financialYear(ctx.today, ctx.prefs.fyStartMonth);
  const fyOptions = [0, 1, 2, 3].map((i) => financialYear(addDays(current.from, -365 * i + 10), ctx.prefs.fyStartMonth).label);
  const fyLabel = param(sp, "fy") ?? current.label;
  const t = await taxSummary(ctx, fyLabel);
  const f = (v: number) => formatMoney(v, ctx.fmt);
  const sym = ctx.prefs.baseCurrency === "INR" ? "₹" : ctx.prefs.baseCurrency;
  const docs = await db.attachment.findMany({ where: { userId: ctx.userId, kind: "TAX_DOCUMENT", financialYear: fyLabel }, orderBy: { createdAt: "desc" } });
  const allRuleYears = (await db.taxRuleSet.findMany({ where: { userId: ctx.userId }, select: { financialYear: true }, distinct: ["financialYear"] })).map((r) => r.financialYear);
  const qfy = `fy=${fyLabel}`;
  const best = [...t.estimates].sort((a, b) => a.result.totalTax - b.result.totalTax)[0];

  const RuleForm = ({ regime, config, verified, notes }: { regime: "NEW" | "OLD"; config?: TaxConfig; verified?: boolean; notes?: string | null }) => {
    const c = config ?? TAX_TEMPLATES["2025-26"][regime];
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="financialYear" value={fyLabel} />
        <input type="hidden" name="regime" value={regime} />
        <Field label="Slabs — one per line: upper limit (₹), rate %" name="slabs" className="sm:col-span-2" hint='Last line: "above, 30"'>
          <Textarea name="slabs" rows={7} className="font-mono text-[12px]" defaultValue={c.slabs.map((s) => `${s.upTo == null ? "above" : minorToInput(s.upTo).replace(/\.00$/, "")}, ${s.ratePct}`).join("\n")} />
        </Field>
        <Field label="Standard deduction (₹)" name="standardDeduction">
          <Input name="standardDeduction" defaultValue={minorToInput(c.standardDeduction)} />
        </Field>
        <Field label="Cess %" name="cessPct">
          <Input name="cessPct" defaultValue={c.cessPct} />
        </Field>
        <Field label="87A rebate: taxable income up to (₹)" name="rebateIncomeLimit">
          <Input name="rebateIncomeLimit" defaultValue={minorToInput(c.rebateIncomeLimit)} />
        </Field>
        <Field label="87A maximum rebate (₹)" name="rebateMax">
          <Input name="rebateMax" defaultValue={minorToInput(c.rebateMax)} />
        </Field>
        <Field label="STCG equity %" name="stcgEquityPct">
          <Input name="stcgEquityPct" defaultValue={c.stcgEquityPct} />
        </Field>
        <Field label="LTCG equity %" name="ltcgEquityPct">
          <Input name="ltcgEquityPct" defaultValue={c.ltcgEquityPct} />
        </Field>
        <Field label="LTCG equity exemption (₹)" name="ltcgEquityExemption">
          <Input name="ltcgEquityExemption" defaultValue={minorToInput(c.ltcgEquityExemption)} />
        </Field>
        <Field label="Other assets LTCG %" name="otherLtcgPct">
          <Input name="otherLtcgPct" defaultValue={c.otherLtcgPct} />
        </Field>
        <Field label="Equity long-term after (months)" name="equityLtcgMonths">
          <Input name="equityLtcgMonths" defaultValue={c.equityLtcgMonths} />
        </Field>
        <Field label="Other assets long-term after (months)" name="otherLtcgMonths">
          <Input name="otherLtcgMonths" defaultValue={c.otherLtcgMonths} />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox name="deductionsAllowed" label="Chapter VI-A deductions allowed (old regime)" defaultChecked={c.deductionsAllowed} />
        </div>
        <Field label="Deduction caps — one per line: section, ₹" name="deductionCaps" className="sm:col-span-2">
          <Textarea name="deductionCaps" rows={4} className="font-mono text-[12px]" defaultValue={Object.entries(c.deductionCaps).map(([k, v]) => `${k}, ${minorToInput(v).replace(/\.00$/, "")}`).join("\n")} />
        </Field>
        <Field label="Notes / source" name="notes" className="sm:col-span-2">
          <Input name="notes" defaultValue={notes ?? ""} placeholder="e.g. Verified against Finance Act / income-tax portal on …" />
        </Field>
        <div className="sm:col-span-2">
          <Checkbox name="verified" label="I have verified these rules against official sources for this year" defaultChecked={verified} />
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={`Financial year ${fyLabel} (${formatDate(t.fy.from, ctx.fmt)} – ${formatDate(t.fy.to, ctx.fmt)})`}
        title="Tax Center"
        description="Organise taxable income, deductions, capital gains, TDS and documents by financial year. Figures are planning estimates, not an official tax computation."
        actions={
          <Suspense>
            <ParamSelect name="fy" label="Financial year" value={fyLabel} options={fyOptions.map((x) => ({ value: x, label: `FY ${x}` }))} />
          </Suspense>
        }
      />
      <Tabs
        active={tab}
        items={[
          { id: "summary", label: "Summary", href: `/tax?${qfy}` },
          { id: "income", label: "Taxable income", href: `/tax?tab=income&${qfy}` },
          { id: "deductions", label: "Deductions", href: `/tax?tab=deductions&${qfy}`, count: t.deductions.length },
          { id: "gains", label: "Capital gains", href: `/tax?tab=gains&${qfy}`, count: t.gains.length },
          { id: "tds", label: "TDS", href: `/tax?tab=tds&${qfy}`, count: t.tds.length },
          { id: "documents", label: "Documents", href: `/tax?tab=documents&${qfy}`, count: docs.length },
          { id: "rules", label: "Tax rules", href: `/tax?tab=rules&${qfy}` },
        ]}
      />

      {tab === "summary" && (
        <>
          <Notice tone="warn" className="mb-4" title="Estimate only">
            Calculated from your records with the rules saved for FY {fyLabel}. It is not tax advice or an official computation — confirm with a tax professional or the income-tax portal before filing.
          </Notice>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Salary income" value={f(t.salary)} />
            <Stat label="Other taxable income" value={f(t.interest + t.dividends + t.otherIncome)} hint={`interest ${f(t.interest)} · dividends ${f(t.dividends)}`} />
            <Stat label="Capital gains" value={f(t.inputs.stcgEquity + t.inputs.ltcgEquity + t.inputs.stcgOther + t.inputs.ltcgOther)} />
            <Stat label="Deductions claimed" value={f(Object.values(t.inputs.deductions).reduce((s, v) => s + v, 0))} />
            <Stat label="TDS deducted" value={f(t.inputs.tdsPaid)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {t.estimates.map((e) => (
              <Card key={e.regime}>
                <CardHeader
                  title={`${e.regime === "NEW" ? "New" : "Old"} regime`}
                  subtitle={e.verified ? "Rules verified by you" : "Rules not yet verified — see Tax rules"}
                  action={
                    <span className="flex gap-1">
                      {best === e && t.estimates.length > 1 && <Badge tone="pos">Lower estimate</Badge>}
                      {!e.verified && <Badge tone="warn">Unverified</Badge>}
                    </span>
                  }
                />
                <div className="divide-y divide-line px-5 pb-4">
                  <KV k="Gross total income" v={f(e.result.grossTotalIncome)} />
                  <KV k="Standard deduction" v={`− ${f(e.result.standardDeduction)}`} />
                  <KV k="Deductions allowed" v={`− ${f(e.result.deductionsAllowed)}`} />
                  <KV k="Taxable at slab rates" v={f(e.result.taxableNormalIncome)} />
                  <KV k="Slab tax" v={f(e.result.slabTax)} />
                  <KV k="Rebate u/s 87A" v={`− ${f(e.result.rebate)}`} />
                  <KV k="Tax on capital gains" v={f(e.result.stcgEquityTax + e.result.ltcgEquityTax + e.result.ltcgOtherTax)} />
                  <KV k="Health & education cess" v={f(e.result.cess)} />
                  <KV k="Estimated total tax" v={<b>{f(e.result.totalTax)}</b>} />
                  <KV k="Less TDS" v={`− ${f(e.result.tdsPaid)}`} />
                  <KV k={e.result.balancePayable >= 0 ? "Estimated balance payable" : "Estimated refund"} v={<b className={e.result.balancePayable > 0 ? "text-neg" : "text-pos"}>{f(Math.abs(e.result.balancePayable))}</b>} />
                </div>
              </Card>
            ))}
            {!t.estimates.length && (
              <Card className="p-6 text-[13px] text-fg-2 lg:col-span-2">No tax rules for FY {fyLabel}. Open the Tax rules tab to add them.</Card>
            )}
          </div>
          <ul className="mt-4 space-y-1 text-[12px] text-muted">
            {t.notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </>
      )}

      {tab === "income" && (
        <Card>
          <CardHeader title="Taxable income by source" subtitle="From income transactions in this FY, by category taxability flag" />
          <div className="divide-y divide-line px-5 pb-4">
            <KV k="Salary & bonus" v={f(t.salary)} />
            <KV k="Interest (savings, FD, bonds)" v={f(t.interest)} />
            <KV k="Dividends" v={f(t.dividends)} />
            <KV k="Other taxable income (freelance, rent, business…)" v={f(t.otherIncome)} />
            <KV k="Exempt / non-taxable income" v={f(t.exempt)} />
            <KV k="Realized capital gains (see Capital gains)" v={f(t.inputs.stcgEquity + t.inputs.ltcgEquity + t.inputs.stcgOther + t.inputs.ltcgOther)} />
          </div>
          <p className="px-5 pb-4 text-[12px] text-muted">Salary is detected from the “Salary” and “Bonus” categories. Mark gifts/refunds as non-taxable in Categories. Freelance and rental income are shown gross (expenses not deducted).</p>
        </Card>
      )}

      {tab === "deductions" && (
        <Card>
          <CardHeader
            title="Deduction records"
            subtitle="80C, 80D, 80CCD(1B), home-loan interest and more. Caps are applied in the estimate."
            action={
              <ModalForm trigger={<><Plus className="size-4" /> Add</>} triggerSize="sm" title="Add deduction" action={saveDeduction}>
                <input type="hidden" name="financialYear" value={fyLabel} />
                <Field label="Section" name="section">
                  <Select name="section">
                    {Object.entries(DEDUCTION_SECTIONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Description" name="description">
                  <Input name="description" placeholder="e.g. ELSS investment, health insurance premium" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount" name="amount">
                    <MoneyInput name="amount" currencySymbol={sym} />
                  </Field>
                  <Field label="Date" name="date">
                    <Input name="date" type="date" defaultValue={ctx.today <= t.fy.to ? ctx.today : t.fy.to} />
                  </Field>
                </div>
              </ModalForm>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Section</Th>
                <Th>Description</Th>
                <Th>Date</Th>
                <Th align="right">Amount</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {t.deductions.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <Badge tone="info">{d.section}</Badge>
                  </Td>
                  <Td>{d.description}</Td>
                  <Td className="text-fg-2">{formatDate(d.date, ctx.fmt)}</Td>
                  <Td align="right">{f(Number(d.amount))}</Td>
                  <Td align="right">
                    <ConfirmAction action={deleteDeduction.bind(null, d.id)} title="Remove deduction?" size="icon" className="size-7">
                      <Trash2 className="size-3.5" />
                    </ConfirmAction>
                  </Td>
                </tr>
              ))}
              {!t.deductions.length && (
                <tr>
                  <Td colSpan={5} className="py-8 text-center text-muted">
                    No deductions recorded for FY {fyLabel}.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "gains" && (
        <Card>
          <CardHeader title="Realized capital gains" subtitle="From investment sales in this FY (average-cost basis). Holding period uses the earliest units still held — verify lot-level details with your broker's statement." />
          <Table>
            <thead>
              <tr>
                <Th>Holding</Th>
                <Th>Sold</Th>
                <Th>Held since</Th>
                <Th>Type</Th>
                <Th align="right">Gain / loss</Th>
              </tr>
            </thead>
            <tbody>
              {t.gains.map((g, i) => (
                <tr key={i}>
                  <Td>
                    {g.holding}
                    <div className="text-[11.5px] text-muted">{ASSET_CLASS_LABELS[g.assetClass as keyof typeof ASSET_CLASS_LABELS]}</div>
                  </Td>
                  <Td>{formatDate(g.sold, ctx.fmt)}</Td>
                  <Td className="text-fg-2">{formatDate(g.acquired, ctx.fmt)}</Td>
                  <Td>
                    <Badge tone={g.term === "LONG" ? "pos" : "warn"}>
                      {g.term === "LONG" ? "LTCG" : "STCG"} · {g.equity ? "equity" : "other"}
                    </Badge>
                  </Td>
                  <Td align="right" className={g.gain >= 0 ? "text-pos" : "text-neg"}>
                    {formatMoney(g.gain, ctx.fmt, { sign: true })}
                  </Td>
                </tr>
              ))}
              {!t.gains.length && (
                <tr>
                  <Td colSpan={5} className="py-8 text-center text-muted">
                    No sales recorded in FY {fyLabel}.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "tds" && (
        <Card>
          <CardHeader
            title="TDS records"
            subtitle="From Form 16 / 16A / 26AS / AIS. TDS on investment payouts recorded in Investments is added automatically."
            action={
              <ModalForm trigger={<><Plus className="size-4" /> Add</>} triggerSize="sm" title="Add TDS entry" action={saveTds}>
                <input type="hidden" name="financialYear" value={fyLabel} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Deductor" name="deductor">
                    <Input name="deductor" placeholder="Employer / bank" />
                  </Field>
                  <Field label="TAN (optional)" name="tan">
                    <Input name="tan" maxLength={10} className="uppercase" />
                  </Field>
                  <Field label="Income type" name="incomeType">
                    <Select name="incomeType">
                      {["SALARY", "INTEREST", "DIVIDEND", "RENT", "PROFESSIONAL", "OTHER"].map((x) => (
                        <option key={x} value={x}>
                          {x.toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Date" name="date">
                    <Input name="date" type="date" defaultValue={ctx.today <= t.fy.to ? ctx.today : t.fy.to} />
                  </Field>
                  <Field label="Gross amount paid" name="grossAmount">
                    <MoneyInput name="grossAmount" currencySymbol={sym} />
                  </Field>
                  <Field label="TDS deducted" name="tdsAmount">
                    <MoneyInput name="tdsAmount" currencySymbol={sym} />
                  </Field>
                </div>
              </ModalForm>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Deductor</Th>
                <Th>Type</Th>
                <Th>Date</Th>
                <Th align="right">Gross</Th>
                <Th align="right">TDS</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {t.tds.map((d) => (
                <tr key={d.id}>
                  <Td>
                    {d.deductor}
                    {d.tan && <div className="font-mono text-[11px] text-muted">{d.tan}</div>}
                  </Td>
                  <Td>{d.incomeType.toLowerCase()}</Td>
                  <Td className="text-fg-2">{formatDate(d.date, ctx.fmt)}</Td>
                  <Td align="right">{f(Number(d.grossAmount))}</Td>
                  <Td align="right">{f(Number(d.tdsAmount))}</Td>
                  <Td align="right">
                    <ConfirmAction action={deleteTds.bind(null, d.id)} title="Remove TDS entry?" size="icon" className="size-7">
                      <Trash2 className="size-3.5" />
                    </ConfirmAction>
                  </Td>
                </tr>
              ))}
              {t.tdsInvest > 0 && (
                <tr>
                  <Td>Investment payouts (from Investments)</Td>
                  <Td>dividend/interest</Td>
                  <Td> </Td>
                  <Td align="right">—</Td>
                  <Td align="right">{f(t.tdsInvest)}</Td>
                  <Td> </Td>
                </tr>
              )}
              {!t.tds.length && !t.tdsInvest && (
                <tr>
                  <Td colSpan={6} className="py-8 text-center text-muted">
                    No TDS recorded for FY {fyLabel}.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader title={`Tax documents — FY ${fyLabel}`} subtitle="Form 16, AIS/26AS, investment proofs, rent receipts. Stored encrypted; only you can download them." />
          <div className="px-5 pb-5">
            <Attachments kind="TAX_DOCUMENT" financialYear={fyLabel} items={docs.map((a) => ({ id: a.id, filename: a.filename + (a.description ? ` — ${a.description}` : ""), size: a.size, mimeType: a.mimeType, createdAt: a.createdAt.toISOString(), description: a.description }))} />
          </div>
        </Card>
      )}

      {tab === "rules" && (
        <>
          <Notice tone="warn" className="mb-4" title="Rules change every year">
            Ledgerline never assumes last year&apos;s rules still apply. A template is included for FY 2025-26 (new & old regime as announced in Budget 2025) — verify it, and add rules for each new financial year from official sources.
          </Notice>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-fg-2">Start FY {fyLabel} rules from:</span>
            {Object.keys(TAX_TEMPLATES).map((k) => (
              <ActionButton key={k} action={copyRules.bind(null, fyLabel, `template:${k}`)}>
                <Copy className="size-3.5" /> FY {k} template
              </ActionButton>
            ))}
            {allRuleYears.filter((y) => y !== fyLabel).map((y) => (
              <ActionButton key={y} action={copyRules.bind(null, fyLabel, y)}>
                <Copy className="size-3.5" /> My FY {y} rules
              </ActionButton>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(["NEW", "OLD"] as const).map((regime) => {
              const saved = t.ruleSets.find((r) => r.regime === regime);
              return (
                <Card key={regime}>
                  <CardHeader
                    title={`${regime === "NEW" ? "New" : "Old"} regime — FY ${fyLabel}`}
                    subtitle={saved ? (saved.verified ? "Saved · verified" : "Saved · not verified") : "Not saved for this year (template values shown)"}
                    action={
                      saved && (
                        <ConfirmAction action={deleteRuleSet.bind(null, saved.id)} title="Delete these rules?" size="icon" className="size-7">
                          <Trash2 className="size-3.5" />
                        </ConfirmAction>
                      )
                    }
                  />
                  <ActionForm action={saveRuleSet} className="px-5 pb-5">
                    <RuleForm regime={regime} config={saved ? (JSON.parse(saved.config) as TaxConfig) : TAX_TEMPLATES[fyLabel]?.[regime]} verified={saved?.verified} notes={saved?.notes} />
                    <div className="mt-4 flex justify-end">
                      <SubmitButton>Save rules</SubmitButton>
                    </div>
                  </ActionForm>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
