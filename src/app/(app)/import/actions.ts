"use server";

import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { importTransactions, type ImportResult } from "@/lib/server/services/importer";
import { deleteTransactions } from "@/lib/server/services/transactions";

const schema = z.object({
  filename: z.string().max(200),
  accountId: z.string().min(1, "Choose an account"),
  text: z.string().min(1, "The file is empty").max(8_000_000, "File too large (8 MB max)"),
  mapping: z.object({
    date: z.string().min(1, "Map the date column"),
    description: z.string().optional(),
    amount: z.string().optional(),
    debit: z.string().optional(),
    credit: z.string().optional(),
    merchant: z.string().optional(),
    category: z.string().optional(),
    notes: z.string().optional(),
  }),
  dayFirst: z.boolean(),
  amountMode: z.enum(["signed", "debitCredit", "positiveExpense"]),
  skipRows: z.array(z.number().int()).max(20000),
  includeDuplicates: z.array(z.number().int()).max(20000).optional(),
});

export type ImportInput = z.infer<typeof schema>;

export async function previewImport(input: ImportInput) {
  const user = await requireUser();
  return run<ImportResult>(async () => {
    const p = schema.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid import");
    const res = await importTransactions(user.id, { ...p.data, dryRun: true });
    return ok(undefined, { ...res, rows: res.rows.slice(0, 2000) });
  });
}

export async function commitImport(input: ImportInput) {
  const user = await requireUser();
  return run<ImportResult>(async () => {
    const p = schema.safeParse(input);
    if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid import");
    const res = await importTransactions(user.id, { ...p.data, dryRun: false });
    await audit(user.id, "import.csv", "ImportBatch", res.batchId, { imported: res.imported, duplicates: res.duplicates, errors: res.errors, skipped: res.skipped });
    revalidateAll();
    return ok(`Imported ${res.imported} of ${res.total} rows`, { ...res, rows: res.rows.slice(0, 2000) });
  });
}

export async function undoImport(batchId: string) {
  const user = await requireUser();
  return run(async () => {
    const batch = await db.importBatch.findFirst({ where: { id: batchId, userId: user.id } });
    if (!batch) return fail("Import not found");
    if (batch.status === "UNDONE") return fail("Already undone");
    const ids = (await db.transaction.findMany({ where: { importBatchId: batchId, userId: user.id }, select: { id: true } })).map((t) => t.id);
    const count = await deleteTransactions(user.id, ids);
    await db.importBatch.update({ where: { id: batchId }, data: { status: "UNDONE" } });
    await audit(user.id, "import.undo", "ImportBatch", batchId, { deleted: count });
    revalidateAll();
    return ok(`Removed ${count} imported transaction${count === 1 ? "" : "s"}`);
  });
}
