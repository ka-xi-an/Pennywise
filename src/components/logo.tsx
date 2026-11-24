import clsx from "clsx";

export function Logo({ inverted = false, compact = false }: { inverted?: boolean; compact?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", inverted ? "text-white" : "text-fg")}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="7" fill={inverted ? "#ffffff" : "currentColor"} />
        <path d="M8 19.5h12" stroke={inverted ? "#0f1b33" : "var(--bg)"} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M8.5 15l4-4 3 3 4.5-5" fill="none" stroke="#34c38f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Ledgerline</span>}
    </span>
  );
}
