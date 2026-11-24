import Link from "next/link";
import { CheckCheck, Trash2 } from "lucide-react";
import { pageCtx } from "@/lib/server/page";
import { db } from "@/lib/server/db";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/server/data";
import { Badge, Card, CardHeader, PageHeader, cx } from "@/components/ui/core";
import { ActionButton } from "@/components/ui/modal";
import { ActionForm, Checkbox, SubmitButton } from "@/components/ui/form";
import { clearReadNotifications, markAllNotificationsRead } from "./actions";
import { saveNotificationPrefs } from "../settings/actions";

export const metadata = { title: "Notifications" };

const PREF_LABELS: Record<string, string> = {
  budget: "Budget thresholds (50/75/90/100%)",
  bills: "Upcoming bills & missed payments",
  largeExpense: "Large expenses",
  unusual: "Unusual spending",
  recurring: "Auto-posted recurring transactions",
  maturity: "Investment maturities",
  goals: "Goal milestones",
  cashflow: "Negative cash-flow projections",
};

export default async function NotificationsPage() {
  const ctx = await pageCtx();
  const items = await db.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <ActionButton action={markAllNotificationsRead} size="md">
              <CheckCheck className="size-4" /> Mark all read
            </ActionButton>
            <ActionButton action={clearReadNotifications} size="md">
              <Trash2 className="size-4" /> Clear read
            </ActionButton>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={cx("flex gap-3 px-5 py-3", !n.readAt && "bg-accent-soft/30")}>
                <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.severity === "critical" ? "bg-neg" : n.severity === "warning" ? "bg-[#eda100]" : n.severity === "success" ? "bg-pos" : "bg-info")} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">
                    {n.link ? (
                      <Link href={n.link} className="hover:underline">
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}{" "}
                    {!n.readAt && <Badge tone="accent">New</Badge>}
                  </p>
                  <p className="text-[12.5px] text-fg-2">{n.body}</p>
                  <p className="text-[11px] text-muted">{n.createdAt.toLocaleString("en-IN")}</p>
                </div>
              </li>
            ))}
            {!items.length && <li className="px-5 py-10 text-center text-[13px] text-muted">No notifications.</li>}
          </ul>
        </Card>
        <Card className="h-fit lg:col-span-4">
          <CardHeader title="Notify me about" />
          <ActionForm action={saveNotificationPrefs} className="space-y-2.5 px-5 pb-5">
            {Object.keys(DEFAULT_NOTIFICATION_PREFS).map((k) => (
              <Checkbox key={k} name={k} label={PREF_LABELS[k]} defaultChecked={ctx.prefs.notificationPrefs[k as keyof typeof DEFAULT_NOTIFICATION_PREFS]} />
            ))}
            <p className="text-[11.5px] text-muted">Large-expense threshold and emergency-fund months are in Settings.</p>
            <SubmitButton variant="secondary">Save</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
