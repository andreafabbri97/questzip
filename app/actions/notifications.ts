"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/campaign-auth";
import { notifications } from "@/lib/db/schema";

// Un'unica lista condivisa (RealtimeProvider) alimenta sia la tendina della campanella sia il
// centro notifiche a pagina intera (/notifiche) — il limite lo decide chi chiama, qui resta solo
// un tetto di sicurezza di default.
export async function getMyNotifications(limit = 100) {
  const userId = await requireUserId();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationRead(id: string) {
  const userId = await requireUserId();
  const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
  if (!notification || notification.userId !== userId) return;
  await db.update(notifications).set({ letta: true }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead() {
  const userId = await requireUserId();
  await db.update(notifications).set({ letta: true }).where(eq(notifications.userId, userId));
}

export async function deleteNotification(id: string) {
  const userId = await requireUserId();
  const [notification] = await db.select().from(notifications).where(eq(notifications.id, id));
  if (!notification || notification.userId !== userId) return;
  await db.delete(notifications).where(eq(notifications.id, id));
}
