"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignHandouts } from "@/lib/db/schema";

export async function getHandoutsForCampaign(campaignId: string) {
  const userId = await requireUserId();
  const membership = await requireMember(campaignId, userId);

  const rows = await db
    .select()
    .from(campaignHandouts)
    .where(eq(campaignHandouts.campaignId, campaignId))
    .orderBy(campaignHandouts.createdAt);

  // i giocatori vedono solo quelli gia' rivelati, il master li vede tutti (compresi quelli
  // preparati in anticipo per un momento futuro della storia)
  return membership.role === "dm" ? rows : rows.filter((h) => h.visibile);
}

export async function createHandout(
  campaignId: string,
  titolo: string,
  testo: string,
  immagineUrl: string,
) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const [handout] = await db
    .insert(campaignHandouts)
    .values({
      campaignId,
      createdBy: userId,
      titolo: titolo.trim() || "Senza titolo",
      testo,
      immagineUrl: immagineUrl.trim() || null,
    })
    .returning();
  return handout;
}

export async function updateHandout(
  handoutId: string,
  values: { titolo: string; testo: string; immagineUrl: string },
) {
  const userId = await requireUserId();
  const [handout] = await db
    .select()
    .from(campaignHandouts)
    .where(eq(campaignHandouts.id, handoutId));
  if (!handout) throw new Error("Handout non trovato.");
  await requireDm(handout.campaignId, userId);

  await db
    .update(campaignHandouts)
    .set({
      titolo: values.titolo.trim() || "Senza titolo",
      testo: values.testo,
      immagineUrl: values.immagineUrl.trim() || null,
    })
    .where(eq(campaignHandouts.id, handoutId));
}

export async function toggleHandoutVisible(handoutId: string) {
  const userId = await requireUserId();
  const [handout] = await db
    .select()
    .from(campaignHandouts)
    .where(eq(campaignHandouts.id, handoutId));
  if (!handout) throw new Error("Handout non trovato.");
  await requireDm(handout.campaignId, userId);

  await db
    .update(campaignHandouts)
    .set({ visibile: !handout.visibile })
    .where(eq(campaignHandouts.id, handoutId));
}

export async function deleteHandout(handoutId: string) {
  const userId = await requireUserId();
  const [handout] = await db
    .select()
    .from(campaignHandouts)
    .where(eq(campaignHandouts.id, handoutId));
  if (!handout) return;
  await requireDm(handout.campaignId, userId);
  await db.delete(campaignHandouts).where(eq(campaignHandouts.id, handoutId));
}
