"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, X } from "lucide-react";
import clsx from "clsx";
import { btnClass } from "./core";
import { ActionForm, SubmitButton } from "./form";
import { useToast } from "./toast";
import type { ActionResult } from "@/lib/actions/result";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "m-auto max-h-[90dvh] w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-surface p-0 text-fg shadow-pop",
        size === "sm" && "max-w-md",
        size === "md" && "max-w-lg",
        size === "lg" && "max-w-2xl",
        size === "xl" && "max-w-4xl",
      )}
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-[12.5px] text-fg-2">{description}</p>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="thin-scroll overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** A button that opens a dialog containing a server-action form. Closes on success. */
export function ModalForm({
  trigger,
  triggerVariant = "secondary",
  triggerSize = "md",
  triggerClassName,
  title,
  description,
  action,
  submitLabel = "Save",
  children,
  size = "md",
  resetOnSuccess = true,
}: {
  trigger: ReactNode;
  triggerVariant?: "primary" | "secondary" | "ghost" | "danger" | "ai";
  triggerSize?: "sm" | "md" | "icon";
  triggerClassName?: string;
  title: ReactNode;
  description?: ReactNode;
  action: (fd: FormData) => Promise<ActionResult<unknown>>;
  submitLabel?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  resetOnSuccess?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <button type="button" className={btnClass(triggerVariant, triggerSize, triggerClassName)} onClick={() => setOpen(true)}>
        {trigger}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description} size={size}>
        <ActionForm
          key={formKey}
          action={action}
          className="grid gap-4"
          onSuccess={() => {
            setOpen(false);
            if (resetOnSuccess) setFormKey((k) => k + 1);
          }}
        >
          {children}
          <div className="-mx-5 -mb-4 mt-1 flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
            <button type="button" className={btnClass("ghost")} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </ActionForm>
      </Dialog>
    </>
  );
}

/** Button → confirmation dialog → server action. Used for every destructive operation. */
export function ConfirmAction({
  action,
  title,
  description,
  confirmLabel = "Delete",
  children,
  variant = "ghost",
  size = "sm",
  className,
  danger = true,
  requireText,
}: {
  action: () => Promise<ActionResult<unknown>>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "icon";
  className?: string;
  danger?: boolean;
  requireText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button type="button" className={btnClass(variant, size, className)} onClick={() => setOpen(true)}>
        {children}
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            {danger && <AlertTriangle className="size-4 text-neg" />}
            {title}
          </span>
        }
        size="sm"
        footer={
          <>
            <button type="button" className={btnClass("ghost")} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || (!!requireText && typed !== requireText)}
              className={btnClass(danger ? "danger" : "primary")}
              onClick={() =>
                start(async () => {
                  const r = await action();
                  if (r.ok) {
                    toast.success(r.message ?? "Done");
                    setOpen(false);
                    if (r.redirect) router.push(r.redirect);
                    else router.refresh();
                  } else toast.error(r.message);
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirmLabel}
            </button>
          </>
        }
      >
        <div className="text-[13px] text-fg-2">{description ?? "This cannot be undone."}</div>
        {requireText && (
          <div className="mt-3">
            <label className="text-[12px] text-fg-2">
              Type <span className="font-mono font-semibold text-fg">{requireText}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px]"
            />
          </div>
        )}
      </Dialog>
    </>
  );
}

/** Fire-and-refresh button for non-destructive one-click actions. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "sm",
  className,
  title,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "ai";
  size?: "sm" | "md" | "icon";
  className?: string;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={pending}
      className={btnClass(variant, size, className)}
      onClick={() =>
        start(async () => {
          const r = await action();
          if (r.ok) {
            if (r.message) toast.success(r.message);
            if (r.redirect) router.push(r.redirect);
            else router.refresh();
          } else toast.error(r.message);
        })
      }
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

export { SubmitButton };
