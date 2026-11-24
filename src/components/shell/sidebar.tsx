"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  Gem,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Receipt,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { NAV } from "@/lib/nav";
import { Logo } from "../logo";

export const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  PiggyBank,
  TrendingUp,
  Gem,
  Target,
  CalendarClock,
  BarChart3,
  Receipt,
  Sparkles,
  Settings,
};

function isActiveSection(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const full = pathname + (sp.toString() ? `?${sp.toString()}` : "");
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((s) => {
        const Icon = ICONS[s.icon];
        const open = isActiveSection(pathname, s.prefixes);
        return (
          <div key={s.id}>
            <Link
              href={s.href}
              onClick={onNavigate}
              className={clsx(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                open ? "text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                s.id === "ai" && "text-ai",
              )}
            >
              <Icon className={clsx("size-4", s.id === "ai" ? "text-ai" : open ? "text-fg" : "text-muted")} aria-hidden />
              {s.label}
            </Link>
            {open && (
              <div className="mb-1.5 ml-[18px] mt-0.5 flex flex-col border-l border-line pl-2.5">
                {s.items.map((i) => {
                  const hasQuery = i.href.includes("?");
                  const active = hasQuery
                    ? full === i.href
                    : pathname === i.href && !(sp.get("type") || sp.get("group") || (sp.get("tab") && s.id === "tax"));
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "rounded-md px-2 py-1 text-[12.5px] transition-colors",
                        active ? "bg-surface-3 font-medium text-fg" : "text-muted hover:text-fg",
                      )}
                    >
                      {i.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function Sidebar({ demoMode }: { demoMode: boolean }) {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard" aria-label="Ledgerline home">
          <Logo />
        </Link>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto px-2.5 pb-4">
        <SidebarNav />
      </div>
      {demoMode && (
        <div className="m-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[11.5px] text-fg-2">
          <span className="font-semibold text-warn">Demo mode.</span> Fictional records are marked “Demo”.{" "}
          <Link href="/settings/data" className="underline">
            Manage
          </Link>
        </div>
      )}
    </aside>
  );
}
