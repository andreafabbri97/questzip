"use server";

import { and, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/campaign-auth";
import { canonicalPair } from "@/lib/social-auth";
import { createNotification } from "@/lib/notifications";
import { campaignMembers, campaigns, friendRequests, friendships, users } from "@/lib/db/schema";

export async function searchUsers(query: string) {
  const userId = await requireUserId();
  const q = query.trim();
  if (q.length < 2) return [];
  // La ricerca funziona anche per email (comodo se non ricordi il nome esatto di qualcuno), ma
  // l'email non va MAI restituita nei risultati — coerente con la scelta già fatta in
  // getPublicProfile di non esporre dati personali oltre a nome/foto a chiunque sia loggato.
  return db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(
      and(ne(users.id, userId), or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`))),
    )
    .limit(10);
}

export async function getFriendsAndRequests() {
  const userId = await requireUserId();

  const pairs = await db
    .select({ userIdLow: friendships.userIdLow, userIdHigh: friendships.userIdHigh })
    .from(friendships)
    .where(or(eq(friendships.userIdLow, userId), eq(friendships.userIdHigh, userId)));
  const friendIds = pairs.map((p) => (p.userIdLow === userId ? p.userIdHigh : p.userIdLow));
  const friends = friendIds.length
    ? await db
        .select({ id: users.id, name: users.name, image: users.image })
        .from(users)
        .where(inArray(users.id, friendIds))
    : [];

  const incoming = await db
    .select({
      id: friendRequests.id,
      fromUserId: friendRequests.richiedenteId,
      fromName: users.name,
      fromImage: users.image,
      createdAt: friendRequests.createdAt,
    })
    .from(friendRequests)
    .innerJoin(users, eq(friendRequests.richiedenteId, users.id))
    .where(and(eq(friendRequests.destinatarioId, userId), eq(friendRequests.stato, "pending")));

  const outgoing = await db
    .select({
      id: friendRequests.id,
      toUserId: friendRequests.destinatarioId,
      toName: users.name,
      toImage: users.image,
      createdAt: friendRequests.createdAt,
    })
    .from(friendRequests)
    .innerJoin(users, eq(friendRequests.destinatarioId, users.id))
    .where(and(eq(friendRequests.richiedenteId, userId), eq(friendRequests.stato, "pending")));

  return { friends, incoming, outgoing };
}

// Profilo pubblico di un altro utente (click su un amico o un membro di campagna) — stesso
// livello di riservatezza già in uso per searchUsers (nome/foto visibili a chiunque sia loggato,
// coerente con un gruppo piccolo e conosciuto): niente di privato come personaggi/campagne NON
// condivise, solo nome/foto, se siete amici e le campagne che avete effettivamente in comune.
export async function getPublicProfile(userId: string) {
  const viewerId = await requireUserId();
  const [user] = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  let isFriend = false;
  if (viewerId !== userId) {
    const [userIdLow, userIdHigh] = canonicalPair(viewerId, userId);
    const [friendshipRow] = await db
      .select()
      .from(friendships)
      .where(and(eq(friendships.userIdLow, userIdLow), eq(friendships.userIdHigh, userIdHigh)));
    isFriend = !!friendshipRow;
  }

  const myCampaignRows = await db
    .select({ campaignId: campaignMembers.campaignId })
    .from(campaignMembers)
    .where(eq(campaignMembers.userId, viewerId));
  const myCampaignIds = myCampaignRows.map((r) => r.campaignId);
  const sharedCampaigns = myCampaignIds.length
    ? await db
        .select({ id: campaigns.id, nome: campaigns.nome })
        .from(campaignMembers)
        .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
        .where(
          and(eq(campaignMembers.userId, userId), inArray(campaignMembers.campaignId, myCampaignIds)),
        )
    : [];

  return { id: user.id, name: user.name, image: user.image, isFriend, sharedCampaigns };
}

async function finalizeFriendship(userA: string, userB: string) {
  const [userIdLow, userIdHigh] = canonicalPair(userA, userB);
  await db.insert(friendships).values({ userIdLow, userIdHigh }).onConflictDoNothing();
}

export async function sendFriendRequest(targetUserId: string) {
  const userId = await requireUserId();
  if (targetUserId === userId) throw new Error("Non puoi inviare una richiesta a te stesso.");

  const [userIdLow, userIdHigh] = canonicalPair(userId, targetUserId);
  const [existingFriendship] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.userIdLow, userIdLow), eq(friendships.userIdHigh, userIdHigh)));
  if (existingFriendship) throw new Error("Siete già amici.");

  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const myName = me?.name ?? "Qualcuno";

  // Se l'altro ti aveva già mandato una richiesta in sospeso, accettala invece di duplicare —
  // equivale a "ci siamo scritti a vicenda", non serve una seconda richiesta pendente.
  const [opposite] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.richiedenteId, targetUserId),
        eq(friendRequests.destinatarioId, userId),
        eq(friendRequests.stato, "pending"),
      ),
    );
  if (opposite) {
    await db
      .update(friendRequests)
      .set({ stato: "accettata" })
      .where(eq(friendRequests.id, opposite.id));
    await finalizeFriendship(userId, targetUserId);
    await createNotification(targetUserId, "friend_accepted", { fromUserId: userId, fromName: myName });
    return;
  }

  const [existingOutgoing] = await db
    .select()
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.richiedenteId, userId),
        eq(friendRequests.destinatarioId, targetUserId),
        eq(friendRequests.stato, "pending"),
      ),
    );
  if (existingOutgoing) return;

  await db.insert(friendRequests).values({ richiedenteId: userId, destinatarioId: targetUserId });
  await createNotification(targetUserId, "friend_request", { fromUserId: userId, fromName: myName });
}

export async function respondToFriendRequest(requestId: string, accept: boolean) {
  const userId = await requireUserId();
  const [request] = await db.select().from(friendRequests).where(eq(friendRequests.id, requestId));
  if (!request) throw new Error("Richiesta non trovata.");
  if (request.destinatarioId !== userId) throw new Error("Non puoi rispondere a questa richiesta.");
  if (request.stato !== "pending") return;

  await db
    .update(friendRequests)
    .set({ stato: accept ? "accettata" : "rifiutata" })
    .where(eq(friendRequests.id, requestId));

  if (accept) {
    await finalizeFriendship(request.richiedenteId, request.destinatarioId);
    const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    await createNotification(request.richiedenteId, "friend_accepted", {
      fromUserId: userId,
      fromName: me?.name ?? "Qualcuno",
    });
  }
}

export async function cancelFriendRequest(requestId: string) {
  const userId = await requireUserId();
  const [request] = await db.select().from(friendRequests).where(eq(friendRequests.id, requestId));
  if (!request) return;
  if (request.richiedenteId !== userId || request.stato !== "pending") {
    throw new Error("Non puoi annullare questa richiesta.");
  }
  await db.delete(friendRequests).where(eq(friendRequests.id, requestId));
}

export async function removeFriend(otherUserId: string) {
  const userId = await requireUserId();
  const [userIdLow, userIdHigh] = canonicalPair(userId, otherUserId);
  await db
    .delete(friendships)
    .where(and(eq(friendships.userIdLow, userIdLow), eq(friendships.userIdHigh, userIdHigh)));
}
