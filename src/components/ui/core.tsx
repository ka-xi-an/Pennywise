import clsx from "clsx";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus, Info } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

export const cx = clsx;

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "ai";
type BtnSize = "sm" | "md" | "icon";

export function btnClass(variant: BtnVariant = "secondary", size: BtnSize = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 select-none",
    size === "sm" && "h-8 px-2.5 text-[12.5px]",
    size === "md" && "h-9 px-3.5 text-[13px]",
    size === "icon" && "size-9",
    variant === "primary" && "bg-fg text-bg hover:opacity-90",
    variant === "secondary" && "border border-line bg-surface text-fg shadow-card hover:bg-surface-2",
    variant === "ghost" && "text-fg-2 hover:bg-surface-2 hover:text-fg",
    variant === "danger" && "bg-neg text-white hover:opacity-90",
    variant === "ai" && "bg-ai text-white hover:opacity-90",
    extra,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: BtnVariant; size?: BtnSize }) {
  return <button type="button" className={btnClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: BtnSize }) {
  return <Link className={btnClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("print-card rounded-xl border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[13.5px] font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-[11.5px] font-medium uppercase tracking-wider text-muted">{eyebrow}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-fg-2">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "pos" | "neg" | "warn" | "info" | "ai" | "accent";
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-surface-3 text-fg-2",
        tone === "pos" && "bg-pos-soft text-pos",
        tone === "neg" && "bg-neg-soft text-neg",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "info" && "bg-info-soft text-info",
        tone === "ai" && "bg-ai-soft text-ai",
        tone === "accent" && "bg-accent-soft text-accent",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="warn" title="Fictional demo record">
      Demo
    </Badge>
  );
}

/** Signed change indicator. `goodWhenUp` flips colour semantics for expense-like metrics. */
export function Delta({
  value,
  goodWhenUp = true,
  suffix = "%",
  label,
}: {
  value: number | null | undefined;
  goodWhenUp?: boolean;
  suffix?: string;
  label?: string;
}) {
  if (value == null || !Number.isFinite(value))
    return <span className="text-[12px] text-muted">{label ? `— ${label}` : "No prior data"}</span>;
  const up = value > 0.05;
  const down = value < -0.05;
  const good = (up && goodWhenUp) || (down && !goodWhenUp);
  const bad = (up && !goodWhenUp) || (down && goodWhenUp);
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-[12px] font-medium", good && "text-pos", bad && "text-neg", !good && !bad && "text-muted")}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{up ? "Up" : down ? "Down" : "Unchanged"}</span>
      {Math.abs(value).toFixed(1)}
      {suffix}
      {label && <span className="ml-1 font-normal text-muted">{label}</span>}
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" className="text-muted hover:text-fg-2" aria-label={text}>
        <Info className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-normal leading-snug text-fg-2 opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-muted">{icon}</div>}
      <p className="text-[14px] font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-fg-2">{description}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ProgressBar({
  value,
  tone,
  className,
  label,
}: {
  value: number | null;
  tone?: "auto" | "accent" | "pos" | "ai";
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const t =
    tone && tone !== "auto"
      ? tone
      : (value ?? 0) >= 100
        ? "neg"
        : (value ?? 0) >= 90
          ? "warn-strong"
          : (value ?? 0) >= 75
            ? "warn"
            : "accent";
  return (
    <div
      className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500",
          t === "accent" && "bg-accent",
          t === "pos" && "bg-pos",
          t === "ai" && "bg-ai",
          t === "warn" && "bg-[#eda100]",
          t === "warn-strong" && "bg-[#ec835a]",
          t === "neg" && "bg-neg",
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  delta,
  tooltip,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  delta?: ReactNode;
  tooltip?: string;
  className?: string;
}) {
  return (
    <Card className={cx("px-4 py-3.5", className)}>
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-fg-2">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </div>
      <div className="mt-1.5 text-[20px] font-semibold tracking-tight text-fg">{value}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {delta}
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </div>
    </Card>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("thin-scroll overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}
export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cx(
        "border-b border-line bg-surface-2/60 px-4 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted first:pl-5 last:pr-5",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}
export function Td({ children, className, align = "left", colSpan }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center"; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={cx(
        "border-b border-line px-4 py-2.5 align-middle first:pl-5 last:pr-5",
        align === "right" && "num text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; id: string; count?: number }[]; active: string }) {
  return (
    <nav className="no-print thin-scroll -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1" aria-label="Sections">
      {items.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors",
            t.id === active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded bg-surface-3 px-1.5 text-[11px] text-fg-2">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "ai" | "neg"; title?: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "rounded-xl border px-4 py-3 text-[12.5px]",
        tone === "info" && "border-info/25 bg-info-soft text-fg-2",
        tone === "warn" && "border-warn/30 bg-warn-soft text-fg-2",
        tone === "ai" && "border-ai/25 bg-ai-soft text-fg-2",
        tone === "neg" && "border-neg/30 bg-neg-soft text-fg-2",
        className,
      )}
    >
      {title && <p className="mb-0.5 font-semibold text-fg">{title}</p>}
      {children}
    </div>
  );
}

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center justify-between gap-4 py-1.5 text-[13px]", className)}>
      <span className="text-fg-2">{k}</span>
      <span className="num font-medium text-fg">{v}</span>
    </div>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cx("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} aria-hidden />;
}
