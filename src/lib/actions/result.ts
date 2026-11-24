import type { z } from "zod";

export type ActionResult<T = unknown> =
  | { ok: true; message?: string; data?: T; redirect?: string }
  | { ok: false; message: string; errors?: Record<string, string> };

export function fail(message: string, errors?: Record<string, string>): ActionResult<never> {
  return { ok: false, message, errors };
}

export function ok<T>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

/** Parse FormData (or an object) with a zod schema into typed data or a field-error result. */
export function parseWith<S extends z.ZodType>(
  schema: S,
  input: FormData | Record<string, unknown>,
): { data: z.infer<S>; error?: undefined } | { data?: undefined; error: ActionResult<never> } {
  const obj: Record<string, unknown> = {};
  if (input instanceof FormData) {
    for (const [k, v] of input.entries()) {
      if (k.startsWith("$ACTION")) continue;
      if (k.endsWith("[]")) {
        const key = k.slice(0, -2);
        (obj[key] ??= [] as unknown[]);
        (obj[key] as unknown[]).push(v);
      } else obj[k] = v;
    }
  } else Object.assign(obj, input);
  const r = schema.safeParse(obj);
  if (r.success) return { data: r.data };
  const errors: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "_form";
    errors[key] ??= issue.message;
  }
  return { error: fail(Object.values(errors)[0] ?? "Please fix the highlighted fields.", errors) };
}
