/** Shared zod field validators (work on FormData strings). */
import { z } from "zod";
import { parseMoney } from "./finance/money";
import { isISODate } from "./finance/dates";

const MAX_MINOR = 10 ** 15; // ₹10 trillion — sanity cap well within safe-integer range

export const str = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`);

export const reqStr = (label: string, max = 200) => str(max).min(1, `${label} is required`);

export const optStr = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const isoDate = (label = "Date") =>
  z.string().trim().refine(isISODate, { message: `${label} must be a valid date` });

export const optDate = (label = "Date") =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isISODate(v), { message: `${label} must be a valid date` })
    .transform((v) => (v ? v : null));

/** Money in major units → integer minor units. */
export const money = (label = "Amount", opts: { positive?: boolean; allowZero?: boolean; allowNegative?: boolean } = {}) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const m = parseMoney(String(v));
      if (m == null) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount` });
        return z.NEVER;
      }
      if (Math.abs(m) > MAX_MINOR) {
        ctx.addIssue({ code: "custom", message: `${label} is too large` });
        return z.NEVER;
      }
      if (!opts.allowNegative && m < 0) {
        ctx.addIssue({ code: "custom", message: `${label} cannot be negative` });
        return z.NEVER;
      }
      if (opts.positive && m <= 0 && !opts.allowZero) {
        ctx.addIssue({ code: "custom", message: `${label} must be greater than zero` });
        return z.NEVER;
      }
      return m;
    });

export const optMoney = (label = "Amount", allowNegative = false) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v == null || String(v).trim() === "") return null;
      const m = parseMoney(String(v));
      if (m == null || (!allowNegative && m < 0)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid amount` });
        return z.NEVER;
      }
      return m;
    });

/** Decimal string (quantity / price / rate). */
export const decimalStr = (label: string, opts: { optional?: boolean; min?: number; max?: number } = {}) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      const s = (v ?? "").replace(/,/g, "");
      if (!s) {
        if (opts.optional) return null;
        ctx.addIssue({ code: "custom", message: `${label} is required` });
        return z.NEVER;
      }
      if (!/^-?\d*\.?\d+$/.test(s)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a number` });
        return z.NEVER;
      }
      const num = Number(s);
      if (opts.min != null && num < opts.min) {
        ctx.addIssue({ code: "custom", message: `${label} must be at least ${opts.min}` });
        return z.NEVER;
      }
      if (opts.max != null && num > opts.max) {
        ctx.addIssue({ code: "custom", message: `${label} must be at most ${opts.max}` });
        return z.NEVER;
      }
      return s;
    });

export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true");

export const intStr = (label: string, min: number, max: number) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

export const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code");

export const idStr = z.string().trim().min(1).max(64);
export const optId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((v) => (v ? v : null));
