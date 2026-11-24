import "server-only";
import { db, n } from "../db";
import { parseCSV } from "@/lib/finance/csv";
import { parseDateFlexible } from "@/lib/finance/dates";
import { parseMoney } from "@/lib/finance/money";
import type { TxType } from "@/lib/finance/types";
import { createTransactionTx } from "./transactions";
import { ValidationError } from "./investments";

export interface ImportMapping {
  date: string;
  description?: string;
  amount?: string;
  debit?: string;
  credit?: string;
  merchant?: string;
  category?: string;
  notes?: string;
}

export interface ImportOptions {
  filename: string;
  accountId: string;
  text: string;
  mapping: ImportMapping;
  dayFirst: boolean;
  amountMode: "signed" | "debitCredit" | "positiveExpense";
  skipRows: number[]; // rows the user excluded in the preview
  includeDuplicates?: number[]; // duplicates the user chose to import anyway
  dryRun: boolean;
}

export interface ImportRow {
  index: number; // 1-based data row number
  status: "ready" | "imported" | "duplicate" | "error" | "skipped";
  errors: string[];
  date: string | null;
  amount: number | null;
  type: TxType | null;
  description: string | null;
  merchant: string | null;
  paymentMethod: string | null;
  categoryId: string | null;
  categoryName: string | null;
  raw: string[];
}

export interface ImportResult {
  headers: string[];
  total: number;
  imported: number;
  ready: number;
  duplicates: number;
  errors: number;
  skipped: number;
  rows: ImportRow[];
  batchId: string | null;
}

const MAX_ROWS = 20000;

/** Extract a readable merchant + payment method from Indian bank narrations. */
export function parseNarration(desc: string): { merchant: string | null; paymentMethod: string | null } {
  const s = desc.trim();
  let m = s.match(/^UPI[/\-](?:(?:CR|DR)[/\-])?(?:\d{6,}[/\-])?([^/\-@]+)/i);
  if (m) return { merchant: tidy(m[1]), paymentMethod: "UPI" };
  m = s.match(/^(NEFT|IMPS|RTGS)[/\-\s:]+(?:[A-Z0-9]{8,}[/\-\s:]+)?([^/\-:]+)/i);
  if (m) return { merchant: tidy(m[2]), paymentMethod: "NEFT_IMPS_RTGS" };
  if (/^(ATM|CASH WDL|NWD)/i.test(s)) return { merchant: "ATM withdrawal", paymentMethod: "CASH" };
  if (/^(POS|PCD|ECOM)/i.test(s)) return { merchant: tidy(s.replace(/^(POS|PCD|ECOM)[\s/\-:]*(\d+[\s/\-:]*)?/i, "").split(/[/\-]/)[0]), paymentMethod: "DEBIT_CARD" };
  if (/ACH|NACH|ECS/i.test(s)) return { merchant: tidy(s.replace(/.*(ACH|NACH|ECS)[\s/\-:]*(DR|CR)?[\s/\-:]*/i, "").split(/[/\-]/)[0]), paymentMethod: "AUTO_DEBIT" };
  return { merchant: null, paymentMethod: null };
}

function tidy(x: string | undefined) {
  const t = (x ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length <= 3 ? t.toUpperCase() : t.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).slice(0, 80);
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);

export async function importTransactions(userId: string, o: ImportOptions): Promise<ImportResult> {
  const account = await db.account.findFirst({ where: { id: o.accountId, userId } });
  if (!account) throw new ValidationError("Choose the account these transactions belong to", "accountId");
  if (account.type === "LOAN") throw new ValidationError("Import into a bank, card, cash or wallet account", "accountId");
  const table = parseCSV(o.text);
  if (table.length < 2) throw new ValidationError("The file has no data rows");
  if (table.length - 1 > MAX_ROWS) throw new ValidationError(`Files are limited to ${MAX_ROWS} rows — split the file`);
  const headers = table[0].map((h) => h.trim());
  const col = (name?: string) => (name ? headers.indexOf(name) : -1);
  const idx = {
    date: col(o.mapping.date),
    description: col(o.mapping.description),
    amount: col(o.mapping.amount),
    debit: col(o.mapping.debit),
    credit: col(o.mapping.credit),
    merchant: col(o.mapping.merchant),
    category: col(o.mapping.category),
    notes: col(o.mapping.notes),
  };
  if (idx.date < 0) throw new ValidationError("Map the date column");
  if (o.amountMode === "debitCredit" ? idx.debit < 0 && idx.credit < 0 : idx.amount < 0) throw new ValidationError("Map the amount column(s)");

  const categories = await db.category.findMany({ where: { userId } });
  const catByName = new Map(categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c]));
  // Learn categories from the user's own history (same merchant → same category).
  const history = await db.transaction.findMany({
    where: { userId, categoryId: { not: null }, merchant: { not: null } },
    select: { merchant: true, categoryId: true, type: true },
    orderBy: { date: "desc" },
    take: 5000,
  });
  const learned = new Map<string, string>();
  for (const h of history) {
    const k = `${h.type}:${norm(h.merchant)}`;
    if (!learned.has(k)) learned.set(k, h.categoryId!);
  }

  const parsedDates: string[] = [];
  const rows: ImportRow[] = table.slice(1).map((raw, i) => {
    const get = (c: number) => (c >= 0 ? (raw[c] ?? "").trim() : "");
    const errors: string[] = [];
    const date = parseDateFlexible(get(idx.date), o.dayFirst);
    if (!date) errors.push(`Unrecognised date “${get(idx.date)}”`);
    let signed: number | null = null;
    if (o.amountMode === "debitCredit") {
      const d = get(idx.debit) ? parseMoney(get(idx.debit), account.currency) : 0;
      const c = get(idx.credit) ? parseMoney(get(idx.credit), account.currency) : 0;
      if (d == null || c == null) errors.push("Invalid debit/credit amount");
      else signed = (c ?? 0) - Math.abs(d ?? 0);
    } else {
      const a = parseMoney(get(idx.amount), account.currency);
      if (a == null) errors.push(`Invalid amount “${get(idx.amount)}”`);
      else signed = o.amountMode === "positiveExpense" ? -Math.abs(a) : a;
    }
    if (signed === 0) errors.push("Amount is zero");
    if (date) parsedDates.push(date);
    const description = get(idx.description) || null;
    const narr = description ? parseNarration(description) : { merchant: null, paymentMethod: null };
    const merchant = get(idx.merchant) || narr.merchant || (description ? description.slice(0, 80) : null);
    const type: TxType | null = signed == null ? null : signed > 0 ? "INCOME" : "EXPENSE";
    let categoryId: string | null = null;
    const catName = get(idx.category);
    if (catName && type) {
      const c = catByName.get(`${type === "INCOME" ? "INCOME" : "EXPENSE"}:${catName.toLowerCase()}`);
      if (c) categoryId = c.id;
    }
    if (!categoryId && type && merchant) categoryId = learned.get(`${type}:${norm(merchant)}`) ?? null;
    return {
      index: i + 1,
      status: errors.length ? "error" : "ready",
      errors,
      date,
      amount: signed == null ? null : Math.abs(signed),
      type,
      description,
      merchant,
      paymentMethod: narr.paymentMethod,
      categoryId,
      categoryName: categoryId ? categories.find((c) => c.id === categoryId)?.name ?? null : null,
      raw,
    } satisfies ImportRow;
  });

  // Duplicate detection against existing records in this account and within the file itself.
  if (parsedDates.length) {
    const min = parsedDates.reduce((a, b) => (a < b ? a : b));
    const max = parsedDates.reduce((a, b) => (a > b ? a : b));
    const existing = await db.transaction.findMany({
      where: { userId, accountId: account.id, date: { gte: min, lte: max } },
      select: { date: true, amount: true, type: true, description: true, merchant: true },
    });
    const seen = new Map<string, number>();
    for (const e of existing) {
      const k = `${e.date}|${n(e.amount)}|${e.type}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const inFile = new Map<string, number>();
    for (const r of rows) {
      if (r.status !== "ready") continue;
      const k = `${r.date}|${r.amount}|${r.type}`;
      const kd = `${k}|${norm(r.description)}`;
      const fileCount = inFile.get(kd) ?? 0;
      inFile.set(kd, fileCount + 1);
      if ((seen.get(k) ?? 0) > 0 || fileCount > 0) {
        if (!o.includeDuplicates?.includes(r.index)) {
          r.status = "duplicate";
          r.errors.push(fileCount > 0 ? "Repeated earlier in this file" : "Matches an existing transaction (same date, amount and type)");
        }
        if ((seen.get(k) ?? 0) > 0) seen.set(k, seen.get(k)! - 1);
      }
    }
  }
  for (const r of rows) if (o.skipRows.includes(r.index) && r.status === "ready") r.status = "skipped";

  let batchId: string | null = null;
  if (!o.dryRun) {
    const toImport = rows.filter((r) => r.status === "ready");
    batchId = await db.$transaction(
      async (tx) => {
        const batch = await tx.importBatch.create({
          data: { userId, filename: o.filename.slice(0, 200), accountId: account.id, totalRows: rows.length, importedRows: 0, skippedRows: 0, errorRows: 0 },
        });
        for (const r of toImport) {
          await createTransactionTx(tx, userId, {
            type: r.type!,
            amount: r.amount!,
            date: r.date!,
            accountId: account.id,
            toAccountId: null,
            toAmount: null,
            categoryId: r.categoryId,
            merchant: r.merchant,
            paymentMethod: r.paymentMethod,
            description: r.description,
            notes: idx.notes >= 0 ? r.raw[idx.notes]?.trim() || null : null,
            tags: [],
            principalAmount: null,
            interestAmount: null,
            loanId: null,
            refundOfId: null,
            holdingId: null,
            quantity: null,
            price: null,
            fees: 0,
            importBatchId: batch.id,
          });
          r.status = "imported";
        }
        await tx.importBatch.update({
          where: { id: batch.id },
          data: {
            importedRows: toImport.length,
            skippedRows: rows.filter((r) => r.status === "skipped" || r.status === "duplicate").length,
            errorRows: rows.filter((r) => r.status === "error").length,
            report: JSON.stringify(rows.map((r) => ({ row: r.index, status: r.status, errors: r.errors }))),
          },
        });
        return batch.id;
      },
      { timeout: 120_000 },
    );
  }
  const count = (s: ImportRow["status"]) => rows.filter((r) => r.status === s).length;
  return {
    headers,
    total: rows.length,
    imported: count("imported"),
    ready: count("ready"),
    duplicates: count("duplicate"),
    errors: count("error"),
    skipped: count("skipped"),
    rows,
    batchId,
  };
}
