"use client";

import { Plus } from "lucide-react";
import { btnClass } from "@/components/ui/core";

/** Opens the global quick-add dialog (rendered once in the top bar). Shortcut: N */
export function QuickAddButton({ label = "Add transaction" }: { label?: string }) {
  return (
    <button type="button" className={btnClass("primary", "sm")} onClick={() => window.dispatchEvent(new Event("ll:quick-add"))}>
      <Plus className="size-3.5" /> {label}
    </button>
  );
}
