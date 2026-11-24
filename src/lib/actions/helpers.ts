import "server-only";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { ValidationError } from "@/lib/server/services/investments";
import { fail, type ActionResult } from "./result";

/** Every financial mutation can affect every module (shared ledger) → refresh all routes. */
export function revalidateAll() {
  revalidatePath("/", "layout");
}

/** Runs a mutation, mapping known errors to friendly action results. */
export async function run<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ValidationError) return fail(e.message, e.field ? { [e.field]: e.message } : undefined);
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return fail("A record with these details already exists.");
      if (e.code === "P2003") return fail("This record is still referenced by other records.");
      if (e.code === "P2025") return fail("Record not found.");
    }
    console.error(e);
    return fail("Something went wrong while saving. Nothing was changed.");
  }
}
