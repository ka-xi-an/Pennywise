"use server";

import { requireUser } from "@/lib/server/auth";
import { getPrefs } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { loadDemoData, removeDemoData } from "@/lib/server/services/demo";
import { fail } from "@/lib/actions/result";
import { revalidateAll } from "@/lib/actions/helpers";
import { todayIn } from "@/lib/finance/dates";
import { backfillSnapshots } from "@/lib/server/services/snapshots";
import { getCtx } from "@/lib/server/data";

export async function startDemo() {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  try {
    const count = await loadDemoData(user.id, todayIn(prefs.timezone));
    await db.userPreference.update({ where: { userId: user.id }, data: { onboarded: true } });
    await audit(user.id, "demo.load", "User", user.id, { transactions: count });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not load demo data");
  }
  try {
    await backfillSnapshots(await getCtx(user.id));
  } catch {}
  revalidateAll();
  return { ok: true as const, message: "Demo data loaded — every fictional record is marked “Demo”", redirect: "/dashboard" };
}

export async function stopDemo() {
  const user = await requireUser();
  await removeDemoData(user.id);
  await audit(user.id, "demo.remove", "User", user.id);
  revalidateAll();
  return { ok: true as const, message: "All demo records removed", redirect: "/dashboard" };
}
