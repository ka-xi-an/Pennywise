import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { getCtx } from "@/lib/server/data";
import { db } from "@/lib/server/db";
import { txFormOptions } from "@/lib/server/options";
import { syncNotifications } from "@/lib/server/services/notifications";
import { recordCurrentSnapshot } from "@/lib/server/services/snapshots";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ctx = await getCtx(user.id);
  if (!ctx.prefs.onboarded) redirect("/onboarding");

  // Derived side effects (idempotent): monthly snapshot + notification feed.
  await Promise.all([
    recordCurrentSnapshot(ctx).catch((e) => console.error("snapshot", e)),
    syncNotifications(ctx).catch((e) => console.error("notifications", e)),
  ]);
  const [options, notifications, unread] = await Promise.all([
    txFormOptions(ctx),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return (
    <div className="min-h-dvh">
      <Suspense>
        <Sidebar demoMode={ctx.prefs.demoMode} />
      </Suspense>
      <div className="lg:pl-[232px]">
        <Topbar
          user={{ name: user.name, email: user.email }}
          options={options}
          unread={unread}
          notifications={notifications.map((n) => ({
            id: n.id,
            title: n.title,
            body: n.body,
            severity: n.severity,
            link: n.link,
            createdAt: n.createdAt.toISOString(),
            read: !!n.readAt,
          }))}
        />
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 lg:px-8 lg:pb-12">{children}</main>
      </div>
    </div>
  );
}
