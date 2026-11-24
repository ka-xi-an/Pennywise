"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
  User,
  X,
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  MoreHorizontal,
  CheckCheck,
} from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../ui/modal";
import { btnClass } from "../ui/core";
import { TransactionForm, type TxFormOptions } from "../transaction-form";
import { SidebarNav } from "./sidebar";
import { Logo } from "../logo";
import { QUICK_PAGES } from "@/lib/nav";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(app)/notifications/actions";
import { logout } from "@/app/(auth)/actions";

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  severity: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  useEffect(() => {
    setTheme((localStorage.getItem("ll-theme") as "light" | "dark" | "system") ?? "system");
  }, []);
  const apply = (t: "light" | "dark" | "system") => {
    localStorage.setItem("ll-theme", t);
    const d = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", d);
    setTheme(t);
  };
  return { theme, apply };
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={clsx("animate-in absolute right-0 top-full z-50 mt-2 rounded-xl border border-line bg-surface shadow-pop", className)}>
      {children}
    </div>
  );
}

interface SearchResult {
  kind: string;
  label: string;
  sub?: string;
  href: string;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
    }
  }, [open]);
  useEffect(() => {
    const term = q.trim();
    const pages = QUICK_PAGES.filter((p) => !term || p.label.toLowerCase().includes(term.toLowerCase()))
      .slice(0, term ? 6 : 8)
      .map((p) => ({ kind: "Page", label: p.label, sub: p.section, href: p.href }));
    if (term.length < 2) {
      setResults(pages);
      setIdx(0);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        const data: SearchResult[] = r.ok ? await r.json() : [];
        setResults([...pages, ...data]);
        setIdx(0);
      } catch {}
    }, 180);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  const go = (r: SearchResult) => {
    onClose();
    router.push(r.href);
  };
  return (
    <Dialog open={open} onClose={onClose} title="Search" size="lg">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && results[idx]) go(results[idx]);
          }}
          placeholder="Search transactions, merchants, accounts, holdings, goals, pages…"
          className="h-10 w-full rounded-lg border border-line bg-surface-2 pl-9 pr-3 text-[13.5px] outline-none focus:border-accent"
          aria-label="Search"
        />
      </div>
      <ul className="mt-3 max-h-[50vh] space-y-0.5 overflow-y-auto" role="listbox">
        {results.map((r, i) => (
          <li key={r.kind + r.href + i} role="option" aria-selected={i === idx}>
            <button
              type="button"
              onMouseEnter={() => setIdx(i)}
              onClick={() => go(r)}
              className={clsx("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left", i === idx ? "bg-surface-3" : "")}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-fg">{r.label}</span>
                {r.sub && <span className="block truncate text-[11.5px] text-muted">{r.sub}</span>}
              </span>
              <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-muted">{r.kind}</span>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted">No matches</li>}
      </ul>
    </Dialog>
  );
}

export function QuickAdd({ options, variant = "button" }: { options: TxFormOptions; variant?: "button" | "fab" }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("ll:quick-add", onOpen);
    return () => window.removeEventListener("ll:quick-add", onOpen);
  }, []);
  return (
    <>
      {variant === "button" ? (
        <span className="hidden sm:inline-flex">
          <button type="button" onClick={() => setOpen(true)} className={btnClass("primary", "md")}>
            <Plus className="size-4" /> New transaction
          </button>
        </span>
      ) : null}
      <Dialog open={open} onClose={() => setOpen(false)} title="New transaction" size="lg">
        {options.accounts.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-fg-2">
            Create an account first.{" "}
            <Link href="/accounts" className="text-accent underline" onClick={() => setOpen(false)}>
              Add account
            </Link>
          </div>
        ) : (
          <TransactionForm options={options} onDone={() => setOpen(false)} />
        )}
      </Dialog>
    </>
  );
}

export function Topbar({
  user,
  options,
  notifications,
  unread,
}: {
  user: { name: string; email: string };
  options: TxFormOptions;
  notifications: NotificationItem[];
  unread: number;
}) {
  const [search, setSearch] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const { theme, apply } = useTheme();
  const router = useRouter();
  const [, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !["INPUT", "TEXTAREA", "SELECT"].includes(tag) && !(e.target as HTMLElement)?.isContentEditable) {
        window.dispatchEvent(new Event("ll:quick-add"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;

  return (
    <>
      <header className="app-header no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-6">
        <button className={btnClass("ghost", "icon", "lg:hidden")} onClick={() => setDrawer(true)} aria-label="Open navigation">
          <Menu className="size-5" />
        </button>
        <Link href="/dashboard" className="lg:hidden" aria-label="Home">
          <Logo compact />
        </Link>
        <button
          type="button"
          onClick={() => setSearch(true)}
          className="ml-1 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] text-muted shadow-card hover:border-line-strong sm:max-w-md"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Search…</span>
          <kbd className="ml-auto hidden rounded border border-line bg-surface-2 px-1.5 text-[10.5px] sm:inline">Ctrl K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <QuickAdd options={options} />
          <button
            className={btnClass("ghost", "icon")}
            onClick={() => apply(theme === "light" ? "dark" : theme === "dark" ? "system" : "light")}
            aria-label={`Theme: ${theme}. Click to change.`}
            title={`Theme: ${theme}`}
          >
            <ThemeIcon className="size-[18px]" />
          </button>
          <div className="relative">
            <button className={btnClass("ghost", "icon", "relative")} onClick={() => setBell((b) => !b)} aria-label={`Notifications (${unread} unread)`}>
              <Bell className="size-[18px]" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-neg px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
            <Popover open={bell} onClose={() => setBell(false)} className="w-[min(380px,calc(100vw-2rem))]">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-[13px] font-semibold">Notifications</span>
                {unread > 0 && (
                  <button
                    className="inline-flex items-center gap-1 text-[12px] text-accent hover:underline"
                    onClick={() => start(async () => void (await markAllNotificationsRead()))}
                  >
                    <CheckCheck className="size-3.5" /> Mark all read
                  </button>
                )}
              </div>
              <ul className="thin-scroll max-h-96 overflow-y-auto">
                {notifications.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-muted">You&apos;re all caught up.</li>}
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      className={clsx("flex w-full gap-3 border-b border-line px-4 py-3 text-left hover:bg-surface-2", !n.read && "bg-accent-soft/40")}
                      onClick={() => {
                        setBell(false);
                        start(async () => {
                          if (!n.read) await markNotificationRead(n.id);
                          if (n.link) router.push(n.link);
                        });
                      }}
                    >
                      <span
                        className={clsx(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          n.severity === "critical" ? "bg-neg" : n.severity === "warning" ? "bg-[#eda100]" : n.severity === "success" ? "bg-pos" : "bg-info",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-medium text-fg">{n.title}</span>
                        <span className="mt-0.5 block text-[12px] text-fg-2">{n.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <Link href="/notifications" onClick={() => setBell(false)} className="block px-4 py-2.5 text-center text-[12.5px] text-accent hover:underline">
                View all
              </Link>
            </Popover>
          </div>
          <div className="relative">
            <button className={btnClass("ghost", "icon")} onClick={() => setMenu((m) => !m)} aria-label="Account menu">
              <span className="flex size-7 items-center justify-center rounded-full bg-fg text-[11.5px] font-semibold text-bg">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
            </button>
            <Popover open={menu} onClose={() => setMenu(false)} className="w-60 py-1">
              <div className="border-b border-line px-4 py-2.5">
                <p className="truncate text-[13px] font-medium">{user.name}</p>
                <p className="truncate text-[12px] text-muted">{user.email}</p>
              </div>
              {[
                { href: "/settings", label: "Profile & preferences", Icon: User },
                { href: "/settings/security", label: "Security", Icon: SettingsIcon },
              ].map(({ href, label, Icon }) => (
                <Link key={href} href={href} onClick={() => setMenu(false)} className="flex items-center gap-2 px-4 py-2 text-[13px] text-fg-2 hover:bg-surface-2 hover:text-fg">
                  <Icon className="size-4" /> {label}
                </Link>
              ))}
              <form action={logout}>
                <button className="flex w-full items-center gap-2 px-4 py-2 text-[13px] text-fg-2 hover:bg-surface-2 hover:text-neg">
                  <LogOut className="size-4" /> Sign out
                </button>
              </form>
            </Popover>
          </div>
        </div>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="animate-in absolute inset-y-0 left-0 flex w-[280px] flex-col bg-surface shadow-pop">
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <button className={btnClass("ghost", "icon")} onClick={() => setDrawer(false)} aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            <div className="thin-scroll flex-1 overflow-y-auto px-2.5 pb-6">
              <SidebarNav onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      )}

      <nav className="mobile-nav no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" aria-label="Quick navigation">
        {[
          { href: "/dashboard", label: "Home", Icon: LayoutDashboard },
          { href: "/transactions", label: "Activity", Icon: ArrowLeftRight },
        ].map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] text-fg-2">
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
        <button onClick={() => window.dispatchEvent(new Event("ll:quick-add"))} className="flex flex-col items-center justify-center" aria-label="New transaction">
          <span className="flex size-10 items-center justify-center rounded-full bg-fg text-bg shadow-pop">
            <Plus className="size-5" />
          </span>
        </button>
        <Link href="/budgets" className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] text-fg-2">
          <PiggyBank className="size-5" />
          Budgets
        </Link>
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10.5px] text-fg-2">
          <MoreHorizontal className="size-5" />
          More
        </button>
      </nav>

      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </>
  );
}
