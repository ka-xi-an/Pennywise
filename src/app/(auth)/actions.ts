"use server";

import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  LOCKOUT,
  clientInfo,
  createSession,
  destroySession,
  dummyVerify,
  hashPassword,
  passwordProblems,
  rateLimit,
  verifyPassword,
} from "@/lib/server/auth";
import { createDefaultCategories } from "@/lib/server/defaults";
import { audit } from "@/lib/server/audit";
import { fail, parseWith, type ActionResult } from "@/lib/actions/result";
import { redirect } from "next/navigation";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  password: z.string().min(1, "Password is required").max(200),
});

export async function signup(fd: FormData): Promise<ActionResult> {
  const { ip } = await clientInfo();
  if (!rateLimit(`signup:${ip}`, 10, 3600_000)) return fail("Too many sign-up attempts. Try again later.");
  const p = parseWith(signupSchema, fd);
  if (p.error) return p.error;
  const { name, email, password } = p.data;
  const problem = passwordProblems(password, email);
  if (problem) return fail(problem, { password: problem });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return fail("An account with this email already exists.", { email: "Already registered — sign in instead." });
  const passwordHash = await hashPassword(password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name, email, passwordHash } });
    await tx.userPreference.create({ data: { userId: u.id } });
    await createDefaultCategories(tx, u.id);
    return u;
  });
  await audit(user.id, "auth.signup", "User", user.id);
  await createSession(user.id);
  redirect("/onboarding");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required").max(200),
  next: z.string().optional(),
});

export async function login(fd: FormData): Promise<ActionResult> {
  const { ip } = await clientInfo();
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000)) return fail("Too many attempts from this network. Wait 15 minutes.");
  const p = parseWith(loginSchema, fd);
  if (p.error) return p.error;
  const { email, password, next } = p.data;
  const user = await db.user.findUnique({ where: { email } });
  const generic = "Incorrect email or password.";
  if (!user) {
    await dummyVerify();
    return fail(generic);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return fail(`Account temporarily locked after repeated failures. Try again after ${user.lockedUntil.toLocaleTimeString("en-IN")}.`);
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failures = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failures >= LOCKOUT.maxFailures ? 0 : failures,
        lockedUntil: failures >= LOCKOUT.maxFailures ? new Date(Date.now() + LOCKOUT.minutes * 60_000) : null,
      },
    });
    await audit(user.id, failures >= LOCKOUT.maxFailures ? "auth.locked" : "auth.login_failed", "User", user.id);
    return fail(generic);
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await createSession(user.id);
  await audit(user.id, "auth.login", "User", user.id);
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  redirect(safeNext);
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
