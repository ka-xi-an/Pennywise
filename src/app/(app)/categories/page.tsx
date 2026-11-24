import Link from "next/link";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { categorySubtree, expenseOf, incomeOf } from "@/lib/finance/ledger";
import { addMonths, startOfMonth } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/core";
import { ActionButton, ModalForm } from "@/components/ui/modal";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { archiveCategory, saveCategory } from "./actions";
import { DeleteCategory } from "./delete-category";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const ctx = await pageCtx();
  const since = addMonths(startOfMonth(ctx.today), -11);
  const stats = new Map<string, { count: number; amount: number }>();
  for (const t of ctx.txs) {
    if (!t.categoryId) continue;
    const s = stats.get(t.categoryId) ?? { count: 0, amount: 0 };
    s.count++;
    if (t.date >= since) s.amount += expenseOf(t) + incomeOf(t);
    stats.set(t.categoryId, s);
  }
  const total = (id: string) => {
    let c = 0,
      a = 0;
    for (const sid of categorySubtree(id, ctx.categories)) {
      c += stats.get(sid)?.count ?? 0;
      a += stats.get(sid)?.amount ?? 0;
    }
    return { count: c, amount: a };
  };

  const CatForm = ({ kind, parentId, c }: { kind: "INCOME" | "EXPENSE"; parentId?: string | null; c?: (typeof ctx.categories)[number] }) => (
    <div className="grid gap-4 sm:grid-cols-2">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="kind" value={kind} />
      <Field label="Name" name="name">
        <Input name="name" defaultValue={c?.name ?? ""} />
      </Field>
      <Field label="Parent" name="parentId">
        <Select name="parentId" defaultValue={c?.parentId ?? parentId ?? ""}>
          <option value="">— Top level —</option>
          {ctx.categories
            .filter((p) => p.kind === kind && !p.parentId && p.id !== c?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Colour" name="color">
        <Input name="color" type="color" defaultValue={c?.color ?? "#6366f1"} className="h-9 w-20 p-1" />
      </Field>
      <div className="flex flex-col justify-end gap-2 pb-1">
        {kind === "EXPENSE" ? (
          <Checkbox name="essential" label="Essential spending (needs)" defaultChecked={c?.essential ?? false} />
        ) : (
          <Checkbox name="taxable" label="Taxable income" defaultChecked={c?.taxable ?? true} />
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="Nested categories power budgets, analytics and tax summaries. Totals include subcategories; amounts are the last 12 months."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {(["EXPENSE", "INCOME"] as const).map((kind) => (
          <Card key={kind}>
            <CardHeader
              title={kind === "EXPENSE" ? "Expense categories" : "Income categories"}
              action={
                <ModalForm trigger={<><Plus className="size-4" /> Add</>} triggerSize="sm" title={`New ${kind.toLowerCase()} category`} action={saveCategory}>
                  <CatForm kind={kind} />
                </ModalForm>
              }
            />
            <ul className="divide-y divide-line">
              {ctx.categories
                .filter((c) => c.kind === kind && !c.parentId)
                .map((p) => {
                  const t = total(p.id);
                  const children = ctx.categories.filter((c) => c.parentId === p.id);
                  return (
                    <li key={p.id} className={p.archived ? "opacity-55" : ""}>
                      <div className="flex items-center gap-2 px-5 py-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                        <Link href={`/transactions?category=${p.id}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        {kind === "EXPENSE" && p.essential && <Badge tone="info">Essential</Badge>}
                        {kind === "INCOME" && !p.taxable && <Badge>Non-taxable</Badge>}
                        {p.archived && <Badge>Archived</Badge>}
                        <span className="ml-auto text-right text-[12px] text-muted">
                          <span className="num text-fg-2">{formatMoney(t.amount, ctx.fmt, { compact: true })}</span> · {t.count} txns
                        </span>
                        <span className="flex gap-0.5">
                          <ModalForm trigger={<Plus className="size-3.5" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-7" title={`New subcategory of ${p.name}`} action={saveCategory}>
                            <CatForm kind={kind} parentId={p.id} />
                          </ModalForm>
                          <ModalForm trigger={<Pencil className="size-3.5" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-7" title={`Edit ${p.name}`} action={saveCategory} resetOnSuccess={false}>
                            <CatForm kind={kind} c={p} />
                          </ModalForm>
                          <ActionButton action={archiveCategory.bind(null, p.id, !p.archived)} variant="ghost" size="icon" className="size-7" title={p.archived ? "Restore" : "Archive"}>
                            {p.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                          </ActionButton>
                          <DeleteCategory id={p.id} name={p.name} count={t.count} targets={ctx.categories.filter((x) => x.kind === kind && x.id !== p.id && x.parentId !== p.id).map((x) => ({ id: x.id, name: x.parentId ? `${ctx.catIdx.get(x.parentId)?.name} › ${x.name}` : x.name }))} />
                        </span>
                      </div>
                      {children.length > 0 && (
                        <ul className="pb-2 pl-10 pr-5">
                          {children.map((c) => {
                            const s = stats.get(c.id);
                            return (
                              <li key={c.id} className={`flex items-center gap-2 py-1 text-[12.5px] ${c.archived ? "opacity-55" : ""}`}>
                                <Link href={`/transactions?category=${c.id}`} className="text-fg-2 hover:underline">
                                  {c.name}
                                </Link>
                                {c.archived && <Badge>Archived</Badge>}
                                <span className="ml-auto text-[11.5px] text-muted">
                                  {formatMoney(s?.amount ?? 0, ctx.fmt, { compact: true })} · {s?.count ?? 0}
                                </span>
                                <span className="flex gap-0.5">
                                  <ModalForm trigger={<Pencil className="size-3" />} triggerVariant="ghost" triggerSize="icon" triggerClassName="size-6" title={`Edit ${c.name}`} action={saveCategory} resetOnSuccess={false}>
                                    <CatForm kind={kind} c={c} />
                                  </ModalForm>
                                  <ActionButton action={archiveCategory.bind(null, c.id, !c.archived)} variant="ghost" size="icon" className="size-6" title={c.archived ? "Restore" : "Archive"}>
                                    {c.archived ? <ArchiveRestore className="size-3" /> : <Archive className="size-3" />}
                                  </ActionButton>
                                  <DeleteCategory id={c.id} name={c.name} count={s?.count ?? 0} small targets={ctx.categories.filter((x) => x.kind === kind && x.id !== c.id).map((x) => ({ id: x.id, name: x.parentId ? `${ctx.catIdx.get(x.parentId)?.name} › ${x.name}` : x.name }))} />
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}
