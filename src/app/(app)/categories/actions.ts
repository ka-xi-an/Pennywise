"use server";

import { z } from "zod";
import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { fail, ok, parseWith } from "@/lib/actions/result";
import { revalidateAll, run } from "@/lib/actions/helpers";
import { checkbox, optId } from "@/lib/validation";

const catSchema = z.object({
  id: optId,
  name: z.string().trim().min(1, "Name is required").max(60),
  kind: z.enum(["INCOME", "EXPENSE"]),
  parentId: optId,
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
  essential: checkbox,
  taxable: checkbox,
});

export async function saveCategory(fd: FormData) {
  const user = await requireUser();
  return run(async () => {
    const p = parseWith(catSchema, fd);
    if (p.error) return p.error;
    const { id, ...d } = p.data;
    if (d.parentId) {
      const parent = await db.category.findFirst({ where: { id: d.parentId, userId: user.id } });
      if (!parent) return fail("Parent category not found");
      if (parent.kind !== d.kind) return fail("Subcategory must match the parent's type");
      if (parent.parentId) return fail("Only one level of subcategories is supported", { parentId: "Choose a top-level category" });
      if (id && parent.id === id) return fail("A category cannot be its own parent");
    }
    const dup = await db.category.findFirst({
      where: { userId: user.id, name: d.name, parentId: d.parentId, kind: d.kind, id: id ? { not: id } : undefined },
    });
    if (dup) return fail("A category with this name already exists here", { name: "Duplicate" });
    if (id) {
      const existing = await db.category.findFirst({ where: { id, userId: user.id }, include: { _count: { select: { children: true } } } });
      if (!existing) return fail("Category not found");
      if (existing.kind !== d.kind) return fail("Category type can't change");
      if (d.parentId && existing._count.children) return fail("A category with subcategories can't become a subcategory");
      await db.category.update({ where: { id }, data: d });
    } else await db.category.create({ data: { ...d, userId: user.id } });
    revalidateAll();
    return ok(id ? "Category updated" : "Category created");
  });
}

/** Delete with optional reassignment of transactions (and child categories) to another category. */
export async function deleteCategory(id: string, reassignTo: string | null) {
  const user = await requireUser();
  return run(async () => {
    const cat = await db.category.findFirst({ where: { id, userId: user.id }, include: { children: true } });
    if (!cat) return fail("Category not found");
    if (reassignTo) {
      const target = await db.category.findFirst({ where: { id: reassignTo, userId: user.id } });
      if (!target || target.kind !== cat.kind) return fail("Choose a category of the same type");
      if (target.id === id || cat.children.some((c) => c.id === target.id)) return fail("Choose a category outside the one being deleted");
    }
    const ids = [id, ...cat.children.map((c) => c.id)];
    const moved = await db.$transaction(async (tx) => {
      const r = await tx.transaction.updateMany({ where: { userId: user.id, categoryId: { in: ids } }, data: { categoryId: reassignTo } });
      await tx.recurringRule.updateMany({ where: { userId: user.id, categoryId: { in: ids } }, data: { categoryId: reassignTo } });
      await tx.category.delete({ where: { id } });
      return r.count;
    });
    await audit(user.id, "category.delete", "Category", id, { moved, reassignTo });
    revalidateAll();
    return ok(`Category deleted · ${moved} transaction${moved === 1 ? "" : "s"} ${reassignTo ? "reassigned" : "now uncategorized"}`);
  });
}

export async function archiveCategory(id: string, archived: boolean) {
  const user = await requireUser();
  await db.category.updateMany({ where: { id, userId: user.id }, data: { archived } });
  revalidateAll();
  return ok(archived ? "Category archived (hidden from pickers)" : "Category restored");
}
