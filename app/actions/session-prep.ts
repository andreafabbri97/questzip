"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireUserId } from "@/lib/campaign-auth";
import { campaignSessionPrepItems } from "@/lib/db/schema";

// Solo per il master — vedi il commento sullo schema (lib/db/schema.ts) per il perché.

export async function getPrepItemsForCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  return db
    .select()
    .from(campaignSessionPrepItems)
    .where(eq(campaignSessionPrepItems.campaignId, campaignId))
    .orderBy(campaignSessionPrepItems.createdAt);
}

export async function addPrepItem(campaignId: string, testo: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const trimmed = testo.trim().slice(0, 500);
  if (!trimmed) return null;
  const [item] = await db
    .insert(campaignSessionPrepItems)
    .values({ campaignId, createdBy: userId, testo: trimmed })
    .returning();
  return item;
}

export async function togglePrepItem(itemId: string) {
  const userId = await requireUserId();
  const [item] = await db
    .select()
    .from(campaignSessionPrepItems)
    .where(eq(campaignSessionPrepItems.id, itemId));
  if (!item) return;
  await requireDm(item.campaignId, userId);
  await db
    .update(campaignSessionPrepItems)
    .set({ fatto: !item.fatto })
    .where(eq(campaignSessionPrepItems.id, itemId));
}

export async function deletePrepItem(itemId: string) {
  const userId = await requireUserId();
  const [item] = await db
    .select()
    .from(campaignSessionPrepItems)
    .where(eq(campaignSessionPrepItems.id, itemId));
  if (!item) return;
  await requireDm(item.campaignId, userId);
  await db.delete(campaignSessionPrepItems).where(eq(campaignSessionPrepItems.id, itemId));
}
