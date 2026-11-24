import "server-only";
import type { Prisma } from "@prisma/client";

type Def = { name: string; color: string; essential?: boolean; taxable?: boolean; children?: string[] };

export const DEFAULT_EXPENSE_CATEGORIES: Def[] = [
  { name: "Housing", color: "#6366f1", essential: true, children: ["Rent", "Maintenance", "Property tax", "Home repairs"] },
  { name: "Food", color: "#f59e0b", essential: true, children: ["Groceries", "Restaurants", "Food delivery", "Coffee & snacks"] },
  { name: "Transportation", color: "#0ea5e9", essential: true, children: ["Fuel", "Public transport", "Cabs & auto", "Vehicle service", "Parking & tolls"] },
  { name: "Utilities", color: "#14b8a6", essential: true, children: ["Electricity", "Water", "Gas / LPG", "Internet", "Mobile"] },
  { name: "Healthcare", color: "#ef4444", essential: true, children: ["Doctor", "Medicines", "Lab tests"] },
  { name: "Education", color: "#8b5cf6", essential: true, children: ["School fees", "Courses", "Books"] },
  { name: "Insurance", color: "#64748b", essential: true, children: ["Health insurance", "Life insurance", "Vehicle insurance"] },
  { name: "Financial expenses", color: "#475569", essential: true, children: ["Loan interest", "Bank charges", "Credit card fees", "Taxes paid"] },
  { name: "Shopping", color: "#ec4899", children: ["Clothing", "Electronics", "Household items"] },
  { name: "Entertainment", color: "#a855f7", children: ["Movies & events", "Games", "Hobbies"] },
  { name: "Subscriptions", color: "#d946ef", children: ["OTT / streaming", "Software", "Memberships"] },
  { name: "Travel", color: "#06b6d4", children: ["Flights", "Hotels", "Trains"] },
  { name: "Personal care", color: "#f43f5e", children: ["Salon", "Fitness"] },
  { name: "Gifts & donations", color: "#84cc16" },
  { name: "Family", color: "#22c55e", children: ["Childcare", "Parents support"] },
  { name: "Miscellaneous", color: "#94a3b8" },
];

export const DEFAULT_INCOME_CATEGORIES: Def[] = [
  { name: "Salary", color: "#10b981", taxable: true },
  { name: "Freelance", color: "#22c55e", taxable: true },
  { name: "Business income", color: "#16a34a", taxable: true },
  { name: "Rental income", color: "#059669", taxable: true },
  { name: "Dividends", color: "#0d9488", taxable: true },
  { name: "Interest", color: "#0891b2", taxable: true },
  { name: "Capital gains", color: "#0284c7", taxable: true },
  { name: "Bonus", color: "#65a30d", taxable: true },
  { name: "Gifts received", color: "#a3e635", taxable: false },
  { name: "Tax refunds", color: "#4ade80", taxable: false },
  { name: "Other income", color: "#86efac", taxable: true },
];

export async function createDefaultCategories(tx: Prisma.TransactionClient, userId: string, only?: Set<string>) {
  let order = 0;
  for (const [kind, defs] of [
    ["EXPENSE", DEFAULT_EXPENSE_CATEGORIES],
    ["INCOME", DEFAULT_INCOME_CATEGORIES],
  ] as const) {
    for (const d of defs) {
      if (only && !only.has(d.name)) continue;
      const parent = await tx.category.create({
        data: {
          userId,
          name: d.name,
          kind,
          color: d.color,
          essential: d.essential ?? false,
          taxable: d.taxable ?? kind === "INCOME",
          sortOrder: order++,
        },
      });
      for (const child of d.children ?? []) {
        await tx.category.create({
          data: { userId, name: child, kind, color: d.color, parentId: parent.id, essential: d.essential ?? false, sortOrder: order++ },
        });
      }
    }
  }
}
