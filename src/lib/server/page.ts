import "server-only";
import { requireUser } from "./auth";
import { getCtx, type Ctx } from "./data";
import { previousRange, resolveRange } from "../finance/dates";
import type { DateRange } from "../finance/types";

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function pageCtx(): Promise<Ctx> {
  const user = await requireUser();
  return getCtx(user.id);
}

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Resolve ?range=&from=&to= into a concrete range plus the comparable previous period. */
export function rangeFrom(
  sp: Record<string, string | string[] | undefined>,
  ctx: Ctx,
  fallback = "this_month",
): { range: DateRange & { preset: string }; prev: DateRange; label: string } {
  const preset = param(sp, "range") ?? fallback;
  const range = resolveRange(preset, ctx.today, {
    from: param(sp, "from"),
    to: param(sp, "to"),
    earliest: ctx.earliestDate,
    fyStartMonth: ctx.prefs.fyStartMonth,
  });
  return { range, prev: previousRange(range), label: `${range.from} → ${range.to}` };
}
