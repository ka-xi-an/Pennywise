import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";

/**
 * Full-fidelity JSON backup of a user's financial data (attachments' binary files are
 * not included — their metadata is listed). Restore REPLACES the user's data inside one
 * DB transaction and remaps every ID, so backups restore cleanly into any account.
 */

const BACKUP_FORMAT = "ledgerline-backup";
const VERSION = 1;

// Order matters: parents before children.
const TABLES = [
  "userPreference",
  "category",
  "account",
  "tag",
  "asset",
  "liability",
  "investmentHolding",
  "loan",
  "recurringRule",
  "transaction",
  "transactionTag",
  "investmentTransaction",
  "priceUpdate",
  "benchmark",
  "budget",
  "budgetLine",
  "goal",
  "goalAccount",
  "goalContribution",
  "recurringOccurrence",
  "netWorthSnapshot",
  "fxRate",
  "taxRuleSet",
  "taxDeduction",
  "tdsRecord",
  "transactionTemplate",
] as const;
type Table = (typeof TABLES)[number];

/** Foreign keys per table → which table's ID map to use. */
const FKS: Partial<Record<Table, Record<string, Table>>> = {
  category: { parentId: "category" },
  investmentHolding: { accountId: "account" },
  loan: { accountId: "account" },
  recurringRule: { accountId: "account", toAccountId: "account", categoryId: "category", loanId: "loan" },
  transaction: { accountId: "account", toAccountId: "account", categoryId: "category", loanId: "loan", recurringRuleId: "recurringRule", refundOfId: "transaction" },
  transactionTag: { transactionId: "transaction", tagId: "tag" },
  investmentTransaction: { holdingId: "investmentHolding", cashTransactionId: "transaction" },
  priceUpdate: { holdingId: "investmentHolding" },
  budgetLine: { budgetId: "budget", categoryId: "category" },
  goalAccount: { goalId: "goal", accountId: "account" },
  goalContribution: { goalId: "goal" },
  recurringOccurrence: { ruleId: "recurringRule", transactionId: "transaction" },
  transactionTemplate: { accountId: "account", toAccountId: "account", categoryId: "category" },
};
const NO_ID: Table[] = ["transactionTag", "goalAccount"];
const DROP_FIELDS = ["userId", "updatedAt", "importBatchId", "reconciliationId"];

type Row = Record<string, unknown>;

export async function exportBackup(userId: string) {
  const where = { userId };
  const data: Record<string, Row[]> = {
    userPreference: await db.userPreference.findMany({ where }),
    category: await db.category.findMany({ where }),
    account: await db.account.findMany({ where }),
    tag: await db.tag.findMany({ where }),
    asset: await db.asset.findMany({ where }),
    liability: await db.liability.findMany({ where }),
    investmentHolding: await db.investmentHolding.findMany({ where }),
    loan: await db.loan.findMany({ where }),
    recurringRule: await db.recurringRule.findMany({ where }),
    transaction: await db.transaction.findMany({ where }),
    transactionTag: await db.transactionTag.findMany({ where: { tag: { userId } } }),
    investmentTransaction: await db.investmentTransaction.findMany({ where }),
    priceUpdate: await db.priceUpdate.findMany({ where: { holding: { userId } } }),
    benchmark: await db.benchmark.findMany({ where }),
    budget: await db.budget.findMany({ where }),
    budgetLine: await db.budgetLine.findMany({ where: { budget: { userId } } }),
    goal: await db.goal.findMany({ where }),
    goalAccount: await db.goalAccount.findMany({ where: { goal: { userId } } }),
    goalContribution: await db.goalContribution.findMany({ where: { goal: { userId } } }),
    recurringOccurrence: await db.recurringOccurrence.findMany({ where: { rule: { userId } } }),
    netWorthSnapshot: await db.netWorthSnapshot.findMany({ where }),
    fxRate: await db.fxRate.findMany({ where }),
    taxRuleSet: await db.taxRuleSet.findMany({ where }),
    taxDeduction: await db.taxDeduction.findMany({ where }),
    tdsRecord: await db.tdsRecord.findMany({ where }),
    transactionTemplate: await db.transactionTemplate.findMany({ where }),
  };
  const attachments = await db.attachment.findMany({ where, select: { filename: true, kind: true, financialYear: true, size: true, createdAt: true } });
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  return JSON.stringify(
    { format: BACKUP_FORMAT, version: VERSION, exportedAt: new Date().toISOString(), counts, attachmentsNotIncluded: attachments, data },
    (_k, v) => (typeof v === "bigint" ? { $big: v.toString() } : v),
  );
}

export function parseBackup(json: string): { counts: Record<string, number>; data: Record<string, Row[]>; exportedAt: string } {
  const obj = JSON.parse(json, (_k, v) => (v && typeof v === "object" && typeof v.$big === "string" && Object.keys(v).length === 1 ? BigInt(v.$big) : v));
  if (obj?.format !== BACKUP_FORMAT) throw new Error("This file is not a Ledgerline backup.");
  if (obj.version > VERSION) throw new Error("This backup was made by a newer version of Ledgerline.");
  for (const t of TABLES) if (obj.data?.[t] && !Array.isArray(obj.data[t])) throw new Error(`Corrupt backup section: ${t}`);
  return { counts: obj.counts ?? {}, data: obj.data, exportedAt: obj.exportedAt };
}

/** Delete every financial record of a user (keeps the user, sessions, audit log, files). */
export async function wipeUserData(tx: Prisma.TransactionClient, userId: string) {
  await tx.investmentTransaction.deleteMany({ where: { userId } });
  await tx.recurringOccurrence.deleteMany({ where: { rule: { userId } } });
  await tx.transaction.updateMany({ where: { userId }, data: { refundOfId: null } });
  await tx.attachment.updateMany({ where: { userId }, data: { transactionId: null } });
  await tx.transaction.deleteMany({ where: { userId } });
  await tx.recurringRule.deleteMany({ where: { userId } });
  await tx.investmentHolding.deleteMany({ where: { userId } });
  await tx.loan.deleteMany({ where: { userId } });
  await tx.importBatch.deleteMany({ where: { userId } });
  await tx.reconciliation.deleteMany({ where: { userId } });
  await tx.account.deleteMany({ where: { userId } });
  await tx.budget.deleteMany({ where: { userId } });
  await tx.goal.deleteMany({ where: { userId } });
  await tx.category.deleteMany({ where: { userId, parentId: { not: null } } });
  await tx.category.deleteMany({ where: { userId } });
  for (const t of ["tag", "asset", "liability", "benchmark", "netWorthSnapshot", "fxRate", "taxRuleSet", "taxDeduction", "tdsRecord", "transactionTemplate", "notification", "aiMessage"] as const) {
    await (tx[t] as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { userId } });
  }
}

const newId = () => "c" + randomBytes(12).toString("hex");

export async function restoreBackup(userId: string, data: Record<string, Row[]>) {
  const maps = new Map<Table, Map<string, string>>(TABLES.map((t) => [t, new Map()]));
  for (const t of TABLES) if (!NO_ID.includes(t)) for (const r of data[t] ?? []) maps.get(t)!.set(String(r.id), newId());

  await db.$transaction(
    async (tx) => {
      await wipeUserData(tx, userId);
      for (const t of TABLES) {
        let rows = (data[t] ?? []).map((r) => {
          const out: Row = { ...r };
          for (const f of DROP_FIELDS) delete out[f];
          if (!NO_ID.includes(t)) out.id = maps.get(t)!.get(String(r.id));
          for (const [field, target] of Object.entries(FKS[t] ?? {})) {
            const v = r[field];
            if (v == null) continue;
            const mapped = maps.get(target)!.get(String(v));
            out[field] = mapped ?? null;
          }
          if (["transactionTag", "priceUpdate", "budgetLine", "goalAccount", "goalContribution", "recurringOccurrence"].includes(t)) return out;
          return { ...out, userId };
        });
        if (t === "userPreference") {
          const p = rows[0];
          if (p) {
            delete p.id;
            delete p.userId;
            await tx.userPreference.upsert({ where: { userId }, create: { ...(p as object), userId } as never, update: p as never });
          }
          continue;
        }
        if (t === "category") rows = [...rows.filter((r) => !r.parentId), ...rows.filter((r) => r.parentId)];
        if (t === "transaction") {
          // Insert without self-references first, then link refunds.
          const refunds = rows.filter((r) => r.refundOfId).map((r) => ({ id: r.id as string, refundOfId: r.refundOfId as string }));
          await tx.transaction.createMany({ data: rows.map((r) => ({ ...r, refundOfId: null })) as never });
          for (const r of refunds) await tx.transaction.update({ where: { id: r.id }, data: { refundOfId: r.refundOfId } });
          continue;
        }
        if (!rows.length) continue;
        const delegate = tx[t] as unknown as { createMany: (a: { data: Row[] }) => Promise<unknown> };
        // Categories need parents to exist first; insert in two batches.
        if (t === "category") {
          await delegate.createMany({ data: rows.filter((r) => !r.parentId) });
          const kids = rows.filter((r) => r.parentId);
          if (kids.length) await delegate.createMany({ data: kids });
        } else await delegate.createMany({ data: rows });
      }
    },
    { timeout: 300_000, maxWait: 30_000 },
  );
}
