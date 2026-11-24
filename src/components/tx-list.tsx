import Link from "next/link";
import clsx from "clsx";
import { ArrowLeftRight } from "lucide-react";
import type { Ctx } from "@/lib/server/data";
import type { TxRec } from "@/lib/finance/types";
import { txView } from "@/lib/server/display";
import { formatDate } from "@/lib/format";
import { DemoBadge } from "./ui/core";

/** Compact transaction list for dashboards and detail pages (server component). */
export function TxList({ ctx, txs, empty = "No transactions yet." }: { ctx: Ctx; txs: TxRec[]; empty?: string }) {
  if (!txs.length) return <p className="px-5 py-8 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {txs.map((t) => {
        const v = txView(ctx, t);
        return (
          <li key={t.id}>
            <Link href={`/transactions/${t.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface-2/60">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold text-white"
                style={{ background: v.tone === "neutral" ? "var(--surface-3)" : v.color }}
                aria-hidden
              >
                {v.tone === "neutral" ? <ArrowLeftRight className="size-4 text-fg-2" /> : v.title.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-fg">
                  <span className="truncate">{v.title}</span>
                  {t.isDemo && <DemoBadge />}
                </span>
                <span className="block truncate text-[11.5px] text-muted">
                  {formatDate(t.date, ctx.fmt)} · {v.subtitle}
                </span>
              </span>
              <span className={clsx("num shrink-0 text-[13px] font-medium", v.tone === "pos" ? "text-pos" : v.tone === "neg" ? "text-fg" : "text-fg-2")}>
                {v.amountText}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
