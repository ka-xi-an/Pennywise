"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, LayoutGrid, Loader2, RotateCcw } from "lucide-react";
import { Dialog } from "@/components/ui/modal";
import { btnClass } from "@/components/ui/core";
import { useToast } from "@/components/ui/toast";
import { saveDashboardLayout } from "@/app/(app)/settings/actions";

export function CustomizeDashboard({ widgets, layout }: { widgets: { id: string; label: string }[]; layout: string[] }) {
  const [open, setOpen] = useState(false);
  const initial = layout.length ? layout : widgets.map((w) => w.id);
  const [order, setOrder] = useState<string[]>([...initial, ...widgets.map((w) => w.id).filter((id) => !initial.includes(id))]);
  const [visible, setVisible] = useState<Set<string>>(new Set(initial));
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const label = (id: string) => widgets.find((w) => w.id === id)?.label ?? id;
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const n = [...o];
      const j = i + d;
      if (j < 0 || j >= n.length) return o;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <>
      <button className={btnClass("secondary")} onClick={() => setOpen(true)}>
        <LayoutGrid className="size-4" /> Customize
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Customize dashboard"
        description="Show, hide and reorder widgets. Saved to your profile."
        footer={
          <>
            <button
              className={btnClass("ghost", "md", "mr-auto")}
              onClick={() => {
                setOrder(widgets.map((w) => w.id));
                setVisible(new Set(widgets.map((w) => w.id)));
              }}
            >
              <RotateCcw className="size-4" /> Reset
            </button>
            <button
              className={btnClass("primary")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveDashboardLayout(order.filter((id) => visible.has(id)));
                  if (r.ok) {
                    toast.success(r.message ?? "Saved");
                    setOpen(false);
                    router.refresh();
                  }
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Save layout
            </button>
          </>
        }
      >
        <ul className="space-y-1">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={visible.has(id)}
                onChange={(e) =>
                  setVisible((v) => {
                    const n = new Set(v);
                    if (e.target.checked) n.add(id);
                    else n.delete(id);
                    return n;
                  })
                }
                aria-label={`Show ${label(id)}`}
              />
              <span className="flex-1 text-[13px]">{label(id)}</span>
              <button className={btnClass("ghost", "icon", "size-7")} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${label(id)} up`}>
                <ArrowUp className="size-3.5" />
              </button>
              <button className={btnClass("ghost", "icon", "size-7")} onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${label(id)} down`}>
                <ArrowDown className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
