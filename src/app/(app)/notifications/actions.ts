"use server";

import { db } from "@/lib/server/db";
import { requireUser } from "@/lib/server/auth";
import { ok } from "@/lib/actions/result";
import { revalidateAll } from "@/lib/actions/helpers";

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  await db.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidateAll();
  return ok();
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidateAll();
  return ok("All notifications marked as read");
}

export async function clearReadNotifications() {
  const user = await requireUser();
  const r = await db.notification.deleteMany({ where: { userId: user.id, readAt: { not: null } } });
  revalidateAll();
  return ok(`Cleared ${r.count} notification${r.count === 1 ? "" : "s"}`);
}
