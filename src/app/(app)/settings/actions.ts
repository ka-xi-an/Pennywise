"use server";

import { z } from "zod";
import { db, big } from "@/lib/server/db";
import { currentSessionId, destroySession, hashPassword, passwordProblems, requireUser, verifyPassword } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { currencyCode, decimalStr, intStr, isoDate, money } from "@/lib/validation";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/server/data";
import { redirect } from "next/navigation";
import { rm } from "node:fs/promises";
import path from "node:path";

const prefSchema = z.object({
  baseCurrency: currencyCode,
  locale: z.string().trim().min(2).max(20),
  timezone: z.string().trim().min(2).max(60),
  fyStartMonth: intStr("Financial year start month", 1, 12),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD MMM YYYY"]),
  largeExpenseThreshold: money("Large expense threshold", { positive: true }),
  emergencyFundMonths: intStr("Emergency fund months", 1, 24),
});

export async function savePreferences(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(prefSchema, fd);
    if (p.error) return p.error;
    try {
      new Intl.NumberFormat(p.data.locale, { style: "currency", currency: p.data.baseCurrency });
      new Intl.DateTimeFormat("en", { timeZone: p.data.timezone });
    } catch {
      return fail("Unsupported locale, currency or timezone");
    }
    await db.userPreference.update({
      where: { userId: user.id },
      data: { ...p.data, largeExpenseThreshold: big(p.data.largeExpenseThreshold) },
    });
    await audit(user.id, "settings.preferences", "UserPreference", null, p.data);
    revalidateAll();
    return ok("Preferences saved");
  });
}

export async function saveProfile(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(z.object({ name: z.string().trim().min(1, "Name is required").max(80) }), fd);
    if (p.error) return p.error;
    await db.user.update({ where: { id: user.id }, data: { name: p.data.name } });
    revalidateAll();
    return ok("Profile updated");
  });
}

export async function saveNotificationPrefs(fd: FormData) {
  const user = await requireUser();
  const prefs = Object.fromEntries(Object.keys(DEFAULT_NOTIFICATION_PREFS).map((k) => [k, fd.get(k) === "on"]));
  await db.userPreference.update({ where: { userId: user.id }, data: { notificationPrefs: JSON.stringify(prefs) } });
  revalidateAll();
  return ok("Notification preferences saved");
}

export async function saveDashboardLayout(layout: string[]) {
  const user = await requireUser();
  const clean = layout.filter((x) => /^[a-z-]{2,40}$/.test(x)).slice(0, 40);
  await db.userPreference.update({ where: { userId: user.id }, data: { dashboardLayout: JSON.stringify(clean) } });
  revalidateAll();
  return ok("Dashboard layout saved");
}

const pwSchema = z.object({
  current: z.string().min(1, "Enter your current password"),
  next: z.string().min(1, "Enter a new password"),
  confirm: z.string().min(1, "Confirm the new password"),
});

export async function changePassword(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(pwSchema, fd);
    if (p.error) return p.error;
    if (p.data.next !== p.data.confirm) return fail("Passwords do not match", { confirm: "Does not match" });
    const problem = passwordProblems(p.data.next, user.email);
    if (problem) return fail(problem, { next: problem });
    const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(p.data.current, full.passwordHash))) return fail("Current password is incorrect", { current: "Incorrect" });
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(p.data.next) } });
    const sid = await currentSessionId();
    await db.session.deleteMany({ where: { userId: user.id, id: sid ? { not: sid } : undefined } });
    await audit(user.id, "auth.password_change", "User", user.id);
    return ok("Password changed — other sessions were signed out");
  });
}

export async function revokeSession(id: string) {
  const user = await requireUser();
  await db.session.deleteMany({ where: { id, userId: user.id } });
  await audit(user.id, "auth.session_revoke", "Session", id);
  revalidateAll();
  return ok("Session signed out");
}

export async function revokeOtherSessions() {
  const user = await requireUser();
  const sid = await currentSessionId();
  const r = await db.session.deleteMany({ where: { userId: user.id, id: sid ? { not: sid } : undefined } });
  await audit(user.id, "auth.sessions_revoke_all", "Session", null, { count: r.count });
  revalidateAll();
  return ok(`Signed out ${r.count} other session${r.count === 1 ? "" : "s"}`);
}

export async function deleteUserAccount(fd: FormData) {
  const user = await requireUser();
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(String(fd.get("password") ?? ""), full.passwordHash))) return fail("Password is incorrect", { password: "Incorrect" });
  if (fd.get("confirm") !== "DELETE") return fail('Type "DELETE" to confirm', { confirm: "Required" });
  const storageDir = path.resolve(process.env.STORAGE_DIR ?? "./storage", user.id);
  await db.$transaction(async (tx) => {
    // Delete ledger rows first (Restrict FKs on accounts), then the user (cascades everything else).
    await tx.investmentTransaction.deleteMany({ where: { userId: user.id } });
    await tx.recurringOccurrence.deleteMany({ where: { rule: { userId: user.id } } });
    await tx.transaction.deleteMany({ where: { userId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
  });
  await rm(storageDir, { recursive: true, force: true }).catch(() => {});
  await audit(null, "auth.account_deleted", "User", user.id);
  await destroySession();
  redirect("/signup");
}

export async function completeOnboarding() {
  const user = await requireUser();
  await db.userPreference.update({ where: { userId: user.id }, data: { onboarded: true } });
  revalidateAll();
  redirect("/dashboard");
}

const fxSchema = z.object({
  fromCurrency: currencyCode,
  toCurrency: currencyCode,
  rate: decimalStr("Rate", { min: 0.0000001 }),
  date: isoDate(),
});

export async function saveFxRate(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(fxSchema, fd);
    if (p.error) return p.error;
    if (p.data.fromCurrency === p.data.toCurrency) return fail("Currencies must differ");
    const d = { ...p.data, rate: p.data.rate! };
    await db.fxRate.upsert({
      where: { userId_fromCurrency_toCurrency_date: { userId: user.id, fromCurrency: d.fromCurrency, toCurrency: d.toCurrency, date: d.date } },
      create: { ...d, userId: user.id },
      update: { rate: d.rate },
    });
    revalidateAll();
    return ok("Exchange rate saved");
  });
}

export async function deleteFxRate(id: string) {
  const user = await requireUser();
  await db.fxRate.deleteMany({ where: { id, userId: user.id } });
  revalidateAll();
  return ok("Exchange rate removed");
}

export async function saveTargetAllocation(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const targets: Record<string, number> = {};
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("t_")) continue;
      const num = Number(v || 0);
      if (!Number.isFinite(num) || num < 0 || num > 100) return fail(`Invalid percentage for ${k.slice(2)}`);
      if (num > 0) targets[k.slice(2)] = num;
    }
    const total = Object.values(targets).reduce((s, x) => s + x, 0);
    if (Math.abs(total - 100) > 0.01) return fail(`Targets must add up to 100% (currently ${total.toFixed(1)}%)`);
    await db.userPreference.update({ where: { userId: user.id }, data: { targetAllocation: JSON.stringify(targets) } });
    revalidateAll();
    return ok("Target allocation saved");
  });
}
