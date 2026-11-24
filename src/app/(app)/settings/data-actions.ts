"use server";

import { requireUser, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { decryptBackup, encryptBackup } from "@/lib/server/crypto";
import { exportBackup, parseBackup, restoreBackup, wipeUserData } from "@/lib/server/services/backup";
import { createDefaultCategories } from "@/lib/server/defaults";
import { fail, ok } from "@/lib/actions/result";
import { revalidateAll } from "@/lib/actions/helpers";

export async function downloadBackup(passphrase: string | null) {
  const user = await requireUser();
  if (passphrase != null && passphrase.length > 0 && passphrase.length < 10) return fail("Use a passphrase of at least 10 characters");
  const json = await exportBackup(user.id);
  const content = passphrase ? encryptBackup(json, passphrase) : json;
  await audit(user.id, "backup.export", "User", user.id, { encrypted: !!passphrase });
  const day = new Date().toISOString().slice(0, 10);
  return ok(undefined, { filename: `ledgerline-backup-${day}${passphrase ? ".enc" : ""}.json`, content });
}

export async function inspectBackup(text: string, passphrase: string | null) {
  await requireUser();
  try {
    const json = text.includes('"ledgerline-backup-encrypted"') ? decryptBackup(text, passphrase ?? "") : text;
    const b = parseBackup(json);
    return ok(undefined, { counts: b.counts, exportedAt: b.exportedAt });
  } catch (e) {
    return fail(e instanceof Error && /auth|decrypt|bad/i.test(e.message) ? "Wrong passphrase or damaged file" : e instanceof Error ? e.message : "Could not read the backup");
  }
}

export async function applyBackup(text: string, passphrase: string | null, password: string) {
  const user = await requireUser();
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(password, full.passwordHash))) return fail("Account password is incorrect");
  try {
    const json = text.includes('"ledgerline-backup-encrypted"') ? decryptBackup(text, passphrase ?? "") : text;
    const b = parseBackup(json);
    await restoreBackup(user.id, b.data);
    await audit(user.id, "backup.restore", "User", user.id, { counts: b.counts, exportedAt: b.exportedAt });
    revalidateAll();
    return { ok: true as const, message: "Backup restored — all data replaced", redirect: "/dashboard" };
  } catch (e) {
    console.error(e);
    return fail(`Restore failed and nothing was changed: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}`);
  }
}

export async function eraseAllData(password: string) {
  const user = await requireUser();
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(password, full.passwordHash))) return fail("Account password is incorrect");
  await db.$transaction(async (tx) => {
    await wipeUserData(tx, user.id);
    await createDefaultCategories(tx, user.id);
    await tx.userPreference.update({ where: { userId: user.id }, data: { demoMode: false } });
  });
  await audit(user.id, "data.erase", "User", user.id);
  revalidateAll();
  return { ok: true as const, message: "All financial data erased. Default categories were recreated.", redirect: "/dashboard" };
}
