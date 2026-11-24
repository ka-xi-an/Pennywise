"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/modal";
import { btnClass } from "@/components/ui/core";
import { useToast } from "@/components/ui/toast";
import { deleteCategory } from "./actions";

export function DeleteCategory({ id, name, count, targets, small }: { id: string; name: string; count: number; targets: { id: string; name: string }[]; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button className={btnClass("ghost", "icon", small ? "size-6" : "size-7")} onClick={() => setOpen(true)} aria-label={`Delete ${name}`} title="Delete">
        <Trash2 className={small ? "size-3" : "size-3.5"} />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Delete “${name}”?`}
        size="sm"
        footer={
          <>
            <button className={btnClass("ghost")} onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className={btnClass("danger")}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await deleteCategory(id, target || null);
                  if (r.ok) {
                    toast.success(r.message ?? "Deleted");
                    setOpen(false);
                    router.refresh();
                  } else toast.error(r.message);
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Delete
            </button>
          </>
        }
      >
        <p className="text-[13px] text-fg-2">
          {count > 0 ? `${count} transaction${count === 1 ? " uses" : "s use"} this category (including subcategories). Move them to:` : "No transactions use this category."}
          {" "}Subcategories and budget lines for it are deleted too.
        </p>
        {count > 0 && (
          <select className="mt-3 h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[13px]" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Reassign to">
            <option value="">Leave uncategorized</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </Dialog>
    </>
  );
}
