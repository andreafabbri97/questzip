"use server";

import { and, desc, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMember, requireUserId } from "@/lib/campaign-auth";
import { canonicalPair, requireFriendship } from "@/lib/social-auth";
import { campaignChatMessages, campaignMembers, chatReadState, directMessages, friendships } from "@/lib/db/schema";
import {
  broadcastCampaignChatMessage,
  broadcastCampaignChatMessageDeleted,
  broadcastDirectMessage,
  broadcastDirectMessageDeleted,
} from "@/lib/party";

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

const DM_HISTORY_LIMIT = 150;

export async function getDirectMessages(otherUserId: string) {
  const userId = await requireUserId();
  await requireFriendship(userId, otherUserId);
  const [userIdLow, userIdHigh] = canonicalPair(userId, otherUserId);

  const rows = await db
    .select()
    .from(directMessages)
    .where(and(eq(directMessages.userIdLow, userIdLow), eq(directMessages.userIdHigh, userIdHigh)))
    .orderBy(desc(directMessages.createdAt))
    .limit(DM_HISTORY_LIMIT);

  return rows.reverse();
}

export async function sendDirectMessage(otherUserId: string, testo: string, replyToId?: string) {
  const userId = await requireUserId();
  await requireFriendship(userId, otherUserId);

  const trimmed = testo.trim();
  if (!trimmed) return null;

  let replyToAuthorId: string | null = null;
  let replyToTesto: string | null = null;
  if (replyToId) {
    const [original] = await db
      .select({ authorId: directMessages.authorId, testo: directMessages.testo })
      .from(directMessages)
      .where(eq(directMessages.id, replyToId));
    if (original) {
      replyToAuthorId = original.authorId;
      replyToTesto = original.testo;
    }
  }

  const [userIdLow, userIdHigh] = canonicalPair(userId, otherUserId);
  const [message] = await db
    .insert(directMessages)
    .values({
      userIdLow,
      userIdHigh,
      authorId: userId,
      testo: trimmed,
      replyToId: replyToAuthorId ? replyToId : null,
      replyToAuthorId,
      replyToTesto,
    })
    .returning();
  await broadcastDirectMessage(userId, otherUserId, message);
  return message;
}

// A differenza della chat di campagna qui non c'è un "master": solo l'autore può eliminare un
// proprio messaggio, nessun'altra parte terza in una conversazione 1-a-1.
export async function deleteDirectMessage(messageId: string) {
  const userId = await requireUserId();
  const [message] = await db.select().from(directMessages).where(eq(directMessages.id, messageId));
  if (!message) return;
  if (message.authorId !== userId) {
    throw new Error("Solo l'autore può eliminare questo messaggio.");
  }

  await db.delete(directMessages).where(eq(directMessages.id, messageId));
  const otherUserId = message.userIdLow === userId ? message.userIdHigh : message.userIdLow;
  await broadcastDirectMessageDeleted(userId, otherUserId, messageId);
}

// roomKey rispecchia esattamente il nome della stanza realtime (vedi lib/party.ts): "campaign-<id>"
// o "dm-<userIdLow>-<userIdHigh>" — così il "non letto" si calcola senza una tabella per tipo.
export async function markThreadRead(roomKey: string) {
  const userId = await requireUserId();
  await db
    .insert(chatReadState)
    .values({ userId, roomKey, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [chatReadState.userId, chatReadState.roomKey],
      set: { lastReadAt: new Date() },
    });
}

// N+1 query deliberata: per un gruppo di poche persone/campagne è più semplice e leggibile di
// un'aggregazione SQL, e il volume di dati non giustifica la complessità in più.
export async function getUnreadThreadKeys(): Promise<string[]> {
  const userId = await requireUserId();

  const myCampaigns = await db
    .select({ campaignId: campaignMembers.campaignId })
    .from(campaignMembers)
    .where(eq(campaignMembers.userId, userId));

  const myFriendPairs = await db
    .select({ userIdLow: friendships.userIdLow, userIdHigh: friendships.userIdHigh })
    .from(friendships)
    .where(or(eq(friendships.userIdLow, userId), eq(friendships.userIdHigh, userId)));

  const readRows = await db.select().from(chatReadState).where(eq(chatReadState.userId, userId));
  const readMap = new Map(readRows.map((r) => [r.roomKey, r.lastReadAt]));

  const unread: string[] = [];

  for (const { campaignId } of myCampaigns) {
    const roomKey = `campaign-${campaignId}`;
    const [latest] = await db
      .select({ createdAt: campaignChatMessages.createdAt })
      .from(campaignChatMessages)
      .where(eq(campaignChatMessages.campaignId, campaignId))
      .orderBy(desc(campaignChatMessages.createdAt))
      .limit(1);
    const lastRead = readMap.get(roomKey);
    if (latest && (!lastRead || lastRead < latest.createdAt)) unread.push(roomKey);
  }

  for (const pair of myFriendPairs) {
    const roomKey = `dm-${pair.userIdLow}-${pair.userIdHigh}`;
    const [latest] = await db
      .select({ createdAt: directMessages.createdAt })
      .from(directMessages)
      .where(and(eq(directMessages.userIdLow, pair.userIdLow), eq(directMessages.userIdHigh, pair.userIdHigh)))
      .orderBy(desc(directMessages.createdAt))
      .limit(1);
    const lastRead = readMap.get(roomKey);
    if (latest && (!lastRead || lastRead < latest.createdAt)) unread.push(roomKey);
  }

  return unread;
}
