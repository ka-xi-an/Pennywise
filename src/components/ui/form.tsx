"use client";

import { createContext, useContext, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useToast } from "./toast";
import { btnClass } from "./core";
import type { ActionResult } from "@/lib/actions/result";

type Action = (fd: FormData) => Promise<ActionResult<unknown>>;

const ErrorsCtx = createContext<Record<string, string>>({});
const PendingCtx = createContext(false);

/**
 * Submits FormData to a server action without React's automatic form reset, so a
 * validation error never wipes what the user typed. Shows toasts and field errors.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  resetOnSuccess = false,
  successMessage,
  id,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  onSuccess?: (r: ActionResult<unknown>) => void;
  resetOnSuccess?: boolean;
  successMessage?: string;
  id?: string;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <ErrorsCtx.Provider value={errors}>
      <PendingCtx.Provider value={pending}>
        <form
          id={id}
          ref={ref}
          className={className}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              try {
                const r = await action(fd);
                if (r.ok) {
                  setErrors({});
                  if (r.message || successMessage) toast.success(r.message ?? successMessage!);
                  if (resetOnSuccess) ref.current?.reset();
                  onSuccess?.(r);
                  if (r.redirect) router.push(r.redirect);
                  else router.refresh();
                } else {
                  setErrors(r.errors ?? {});
                  toast.error(r.message);
                }
              } catch (err) {
                // Next's redirect() throws a control-flow error that must propagate.
                if (err && typeof err === "object" && "digest" in err && String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT"))
                  throw err;
                toast.error("Something went wrong. Please try again.");
              }
            });
          }}
        >
          {children}
        </form>
      </PendingCtx.Provider>
    </ErrorsCtx.Provider>
  );
}

export function useFieldError(name: string) {
  return useContext(ErrorsCtx)[name];
}
export function useFormPending() {
  return useContext(PendingCtx);
}

export function Field({
  label,
  name,
  hint,
  children,
  className,
  required,
}: {
  label: ReactNode;
  name?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  const err = useFieldError(name ?? "");
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={name} className="text-[12.5px] font-medium text-fg-2">
        {label}
        {required && <span className="ml-0.5 text-neg">*</span>}
      </label>
      {children}
      {err ? (
        <p id={`${name}-error`} className="text-[12px] text-neg" role="alert">
          {err}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] text-fg placeholder:text-muted outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60 aria-[invalid=true]:border-neg";

export function Input({ name, className, ...props }: ComponentProps<"input">) {
  const err = useFieldError(name ?? "");
  return (
    <input
      id={name}
      name={name}
      aria-invalid={!!err}
      aria-describedby={err ? `${name}-error` : undefined}
      className={clsx(inputCls, className)}
      {...props}
    />
  );
}

export function MoneyInput({ name, currencySymbol = "₹", className, ...props }: ComponentProps<"input"> & { currencySymbol?: string }) {
  const err = useFieldError(name ?? "");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-muted">{currencySymbol}</span>
      <input
        id={name}
        name={name}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={!!err}
        className={clsx(inputCls, "num pl-7", className)}
        placeholder="0.00"
        {...props}
      />
    </div>
  );
}

export function Select({ name, className, children, ...props }: ComponentProps<"select">) {
  const err = useFieldError(name ?? "");
  return (
    <select id={name} name={name} aria-invalid={!!err} className={clsx(inputCls, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ name, className, ...props }: ComponentProps<"textarea">) {
  const err = useFieldError(name ?? "");
  return (
    <textarea
      id={name}
      name={name}
      aria-invalid={!!err}
      className={clsx(inputCls, "h-auto min-h-[72px] py-2", className)}
      {...props}
    />
  );
}

export function Checkbox({ name, label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={clsx("flex cursor-pointer items-center gap-2 text-[13px] text-fg-2", className)}>
      <input type="checkbox" name={name} className="size-4 rounded border-line accent-[var(--accent)]" {...props} />
      {label}
    </label>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  form,
}: {
  children: ReactNode;
  variant?: "primary" | "danger" | "secondary" | "ai";
  className?: string;
  form?: string;
}) {
  const pending = useFormPending();
  return (
    <button type="submit" form={form} disabled={pending} className={btnClass(variant, "md", className)}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function FormError() {
  const err = useFieldError("_form");
  return err ? (
    <p className="rounded-lg bg-neg-soft px-3 py-2 text-[12.5px] text-neg" role="alert">
      {err}
    </p>
  ) : null;
}
