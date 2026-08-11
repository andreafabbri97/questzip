"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireUserId } from "@/lib/campaign-auth";
import { campaignQuests } from "@/lib/db/schema";

// Solo per il master — vedi il commento sullo schema (lib/db/schema.ts) per il perché.

export async function getQuestsForCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  return db
    .select()
    .from(campaignQuests)
    .where(eq(campaignQuests.campaignId, campaignId))
    .orderBy(campaignQuests.createdAt);
}

export async function createQuest(campaignId: string, titolo: string, descrizione: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const [quest] = await db
    .insert(campaignQuests)
    .values({
      campaignId,
      createdBy: userId,
      titolo: (titolo.trim() || "Trama senza titolo").slice(0, 100),
      descrizione: descrizione.slice(0, 10000),
    })
    .returning();
  return quest;
}

export async function updateQuest(
  questId: string,
  values: {
    titolo: string;
    descrizione: string;
    stato: "attiva" | "completata" | "fallita" | "in_pausa";
  },
) {
  const userId = await requireUserId();
  const [quest] = await db.select().from(campaignQuests).where(eq(campaignQuests.id, questId));
  if (!quest) throw new Error("Trama non trovata.");
  await requireDm(quest.campaignId, userId);

  await db
    .update(campaignQuests)
    .set({
      titolo: (values.titolo.trim() || "Trama senza titolo").slice(0, 100),
      descrizione: values.descrizione.slice(0, 10000),
      stato: values.stato,
    })
    .where(eq(campaignQuests.id, questId));
}

export async function deleteQuest(questId: string) {
  const userId = await requireUserId();
  const [quest] = await db.select().from(campaignQuests).where(eq(campaignQuests.id, questId));
  if (!quest) return;
  await requireDm(quest.campaignId, userId);
  await db.delete(campaignQuests).where(eq(campaignQuests.id, questId));
}
