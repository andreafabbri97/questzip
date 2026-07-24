"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignChatMessages } from "@/lib/db/schema";
import { broadcastCampaignChatMessage, broadcastCampaignChatMessageDeleted } from "@/lib/party";

// Nessuna paginazione vera in questo giro (proporzionato a un gruppo di poche persone, non un
// server Discord): si carica sempre e solo la cronologia più recente.
const CAMPAIGN_CHAT_HISTORY_LIMIT = 150;

export async function getCampaignChatMessages(campaignId: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);

  const rows = await db
    .select()
    .from(campaignChatMessages)
    .where(eq(campaignChatMessages.campaignId, campaignId))
    .orderBy(desc(campaignChatMessages.createdAt))
    .limit(CAMPAIGN_CHAT_HISTORY_LIMIT);

  return rows.reverse();
}

export async function sendCampaignChatMessage(campaignId: string, testo: string, replyToId?: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);

  const trimmed = testo.trim();
  if (!trimmed) return null;

  // Scatto di autore/testo del messaggio a cui si risponde, preso ORA — non una join, così la
  // citazione resta leggibile anche se l'originale viene poi cancellato (vedi commento in schema.ts).
  let replyToAuthorId: string | null = null;
  let replyToTesto: string | null = null;
  if (replyToId) {
    const [original] = await db
      .select({ authorId: campaignChatMessages.authorId, testo: campaignChatMessages.testo })
      .from(campaignChatMessages)
      .where(eq(campaignChatMessages.id, replyToId));
    if (original) {
      replyToAuthorId = original.authorId;
      replyToTesto = original.testo;
    }
  }

  const [message] = await db
    .insert(campaignChatMessages)
    .values({
      campaignId,
      authorId: userId,
      testo: trimmed,
      replyToId: replyToAuthorId ? replyToId : null,
      replyToAuthorId,
      replyToTesto,
    })
    .returning();
  await broadcastCampaignChatMessage(campaignId, message);
  return message;
}

export async function deleteCampaignChatMessage(messageId: string) {
  const userId = await requireUserId();
  const [message] = await db
    .select()
    .from(campaignChatMessages)
    .where(eq(campaignChatMessages.id, messageId));
  if (!message) return;

  const membership = await requireMember(message.campaignId, userId);
  if (message.authorId !== userId && membership.role !== "dm") {
    throw new Error("Solo l'autore o il master possono eliminare questo messaggio.");
  }

  await db.delete(campaignChatMessages).where(eq(campaignChatMessages.id, messageId));
  await broadcastCampaignChatMessageDeleted(message.campaignId, messageId);
}
