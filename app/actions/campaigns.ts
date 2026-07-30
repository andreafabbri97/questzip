"use server";

import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { requireFriendship } from "@/lib/social-auth";
import { createNotification } from "@/lib/notifications";
import {
  campaignFriendInvites,
  campaignInvites,
  campaignMembers,
  campaignSessionNotes,
  campaigns,
  friendships,
  users,
} from "@/lib/db/schema";
import { broadcastJukeboxChanged } from "@/lib/party";

export async function createCampaign(nome: string, descrizione: string) {
  const userId = await requireUserId();
  // Le colonne testo di Postgres non hanno un limite intrinseco (a differenza di varchar(n)) —
  // un tetto qui evita che un nome/descrizione enorme finisca ovunque venga mostrato (liste,
  // header, link condivisi) senza nessun controllo a monte.
  const [campaign] = await db
    .insert(campaigns)
    .values({ nome: nome.trim().slice(0, 100), descrizione: descrizione.trim().slice(0, 2000), ownerId: userId })
    .returning();
  await db.insert(campaignMembers).values({
    campaignId: campaign.id,
    userId,
    role: "dm",
  });
  return campaign;
}

export async function getMyCampaigns() {
  const userId = await requireUserId();
  return db
    .select({
      id: campaigns.id,
      nome: campaigns.nome,
      descrizione: campaigns.descrizione,
      role: campaignMembers.role,
    })
    .from(campaignMembers)
    .innerJoin(campaigns, eq(campaignMembers.campaignId, campaigns.id))
    .where(eq(campaignMembers.userId, userId));
}

export async function getCampaign(campaignId: string) {
  const userId = await requireUserId();
  const [membership] = await db
    .select()
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  if (!membership) throw new Error("Non fai parte di questa campagna.");

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  const members = await db
    .select({
      userId: campaignMembers.userId,
      role: campaignMembers.role,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(campaignMembers)
    .innerJoin(users, eq(campaignMembers.userId, users.id))
    .where(eq(campaignMembers.campaignId, campaignId));
  const sessionNotes = await db
    .select()
    .from(campaignSessionNotes)
    .where(eq(campaignSessionNotes.campaignId, campaignId))
    .orderBy(campaignSessionNotes.createdAt);

  return { campaign, members, sessionNotes, myRole: membership.role };
}

export async function createInvite(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  // Senza una scadenza il link resta valido per sempre — chiunque lo trovi (screenshot vecchio,
  // link condiviso per sbaglio in un posto pubblico) può ancora unirsi a distanza di anni. Una
  // settimana è ampia per il caso d'uso reale (invitare qualcuno alla prossima sessione) senza
  // lasciare un accesso a tempo indeterminato aperto.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const [invite] = await db
    .insert(campaignInvites)
    .values({ campaignId, createdBy: userId, expiresAt })
    .returning();
  return invite.code;
}

export async function revokeInvite(campaignId: string, code: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  await db
    .delete(campaignInvites)
    .where(and(eq(campaignInvites.campaignId, campaignId), eq(campaignInvites.code, code)));
}

export async function redeemInvite(code: string) {
  const userId = await requireUserId();
  const [invite] = await db.select().from(campaignInvites).where(eq(campaignInvites.code, code));
  if (!invite) throw new Error("Invito non valido.");
  if (invite.expiresAt && invite.expiresAt < new Date()) throw new Error("Invito scaduto.");

  const [existing] = await db
    .select()
    .from(campaignMembers)
    .where(
      and(eq(campaignMembers.campaignId, invite.campaignId), eq(campaignMembers.userId, userId)),
    );
  if (!existing) {
    await db.insert(campaignMembers).values({
      campaignId: invite.campaignId,
      userId,
      role: "player",
    });
  }
  return invite.campaignId;
}

// Amici del master non ancora nella campagna e senza un invito già in sospeso — per il
// selettore "invita un amico", in aggiunta al link/codice generico di createInvite (che resta
// utile per chi non è ancora amico su QuestZip).
export async function getMyCampaignFriendsPicker(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);

  const pairs = await db
    .select({ userIdLow: friendships.userIdLow, userIdHigh: friendships.userIdHigh })
    .from(friendships)
    .where(or(eq(friendships.userIdLow, userId), eq(friendships.userIdHigh, userId)));
  const friendIds = pairs.map((p) => (p.userIdLow === userId ? p.userIdHigh : p.userIdLow));
  if (friendIds.length === 0) return [];

  const existingMembers = await db
    .select({ userId: campaignMembers.userId })
    .from(campaignMembers)
    .where(eq(campaignMembers.campaignId, campaignId));
  const memberIds = new Set(existingMembers.map((m) => m.userId));

  const pendingInvites = await db
    .select({ userId: campaignFriendInvites.invitedUserId })
    .from(campaignFriendInvites)
    .where(
      and(eq(campaignFriendInvites.campaignId, campaignId), eq(campaignFriendInvites.stato, "pending")),
    );
  const pendingIds = new Set(pendingInvites.map((i) => i.userId));

  const eligibleIds = friendIds.filter((id) => !memberIds.has(id) && !pendingIds.has(id));
  if (eligibleIds.length === 0) return [];

  return db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(inArray(users.id, eligibleIds));
}

export async function inviteFriendToCampaign(campaignId: string, friendUserId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  await requireFriendship(userId, friendUserId);

  const [existingMember] = await db
    .select()
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, friendUserId)));
  if (existingMember) throw new Error("È già membro della campagna.");

  const [existingInvite] = await db
    .select()
    .from(campaignFriendInvites)
    .where(
      and(
        eq(campaignFriendInvites.campaignId, campaignId),
        eq(campaignFriendInvites.invitedUserId, friendUserId),
        eq(campaignFriendInvites.stato, "pending"),
      ),
    );
  if (existingInvite) return;

  let invite: typeof campaignFriendInvites.$inferSelect;
  try {
    [invite] = await db
      .insert(campaignFriendInvites)
      .values({ campaignId, invitedUserId: friendUserId, invitedBy: userId })
      .returning();
  } catch {
    // Vinto dal vincolo unico parziale (due chiamate quasi simultanee) — equivale al ramo
    // "existingInvite" sopra, l'invito pendente esiste già.
    return;
  }

  const [campaign] = await db.select({ nome: campaigns.nome }).from(campaigns).where(eq(campaigns.id, campaignId));
  const [inviter] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  await createNotification(friendUserId, "campaign_invite", {
    inviteId: invite.id,
    campaignId,
    campaignNome: campaign?.nome ?? "",
    inviterId: userId,
    inviterName: inviter?.name ?? "Il master",
  });
}

export async function respondToCampaignFriendInvite(inviteId: string, accept: boolean) {
  const userId = await requireUserId();
  const [invite] = await db
    .select()
    .from(campaignFriendInvites)
    .where(eq(campaignFriendInvites.id, inviteId));
  if (!invite) throw new Error("Invito non trovato.");
  if (invite.invitedUserId !== userId) throw new Error("Non puoi rispondere a questo invito.");
  if (invite.stato !== "pending") return null;

  await db
    .update(campaignFriendInvites)
    .set({ stato: accept ? "accettato" : "rifiutato" })
    .where(eq(campaignFriendInvites.id, inviteId));

  if (accept) {
    const [existing] = await db
      .select()
      .from(campaignMembers)
      .where(
        and(eq(campaignMembers.campaignId, invite.campaignId), eq(campaignMembers.userId, userId)),
      );
    if (!existing) {
      await db.insert(campaignMembers).values({ campaignId: invite.campaignId, userId, role: "player" });
    }
  }

  const [campaign] = await db
    .select({ nome: campaigns.nome })
    .from(campaigns)
    .where(eq(campaigns.id, invite.campaignId));
  const [responder] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  await createNotification(invite.invitedBy, "campaign_invite_response", {
    campaignId: invite.campaignId,
    campaignNome: campaign?.nome ?? "",
    responderName: responder?.name ?? "Qualcuno",
    accepted: accept,
  });

  return invite.campaignId;
}

// Il ruolo "dm" è l'UNICA chiave usata da requireDm — a differenza di ownerId (usato solo per
// abbandonare/eliminare la campagna), non c'è nessun percorso di recupero se il master resta a
// zero: nessuno potrebbe più promuovere nessuno, un blocco permanente senza intervento manuale
// sul database. Va quindi impedito prima che possa succedere, non corretto dopo.
async function countDms(campaignId: string) {
  const rows = await db
    .select({ userId: campaignMembers.userId })
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, "dm")));
  return rows.length;
}

export async function setMemberRole(
  campaignId: string,
  targetUserId: string,
  role: "dm" | "player",
) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  if (role === "player") {
    const [target] = await db
      .select({ role: campaignMembers.role })
      .from(campaignMembers)
      .where(
        and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, targetUserId)),
      );
    if (target?.role === "dm" && (await countDms(campaignId)) <= 1) {
      throw new Error("Non puoi togliere l'ultimo master della campagna.");
    }
  }
  await db
    .update(campaignMembers)
    .set({ role })
    .where(
      and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, targetUserId)),
    );
}

export async function removeMember(campaignId: string, targetUserId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const [target] = await db
    .select({ role: campaignMembers.role })
    .from(campaignMembers)
    .where(
      and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, targetUserId)),
    );
  if (target?.role === "dm" && (await countDms(campaignId)) <= 1) {
    throw new Error("Non puoi rimuovere l'ultimo master della campagna.");
  }
  await db
    .delete(campaignMembers)
    .where(
      and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, targetUserId)),
    );
}

export async function leaveCampaign(campaignId: string) {
  const userId = await requireUserId();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (campaign?.ownerId === userId) {
    throw new Error("Il creatore non può abbandonare la campagna, solo eliminarla.");
  }
  await db
    .delete(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
}

export async function deleteCampaign(campaignId: string) {
  const userId = await requireUserId();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (campaign?.ownerId !== userId) throw new Error("Solo chi ha creato la campagna può eliminarla.");
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
}

export async function addSessionNote(campaignId: string, titolo: string, testo: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);
  await db.insert(campaignSessionNotes).values({ campaignId, authorId: userId, titolo, testo });
}

// Jukebox condiviso: un solo brano "in riproduzione" per campagna (niente coda). Il master
// imposta l'URL, gli altri lo leggono via realtime ma devono comunque cliccare "riproduci" sul
// proprio dispositivo — i browser bloccano l'autoplay audio senza un gesto utente diretto, non
// e' aggirabile lato client.
export async function setJukeboxTrack(campaignId: string, url: string, titolo: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  await db
    .update(campaigns)
    .set({ jukeboxUrl: url.trim() || null, jukeboxTitolo: titolo.trim() || null })
    .where(eq(campaigns.id, campaignId));
  await broadcastJukeboxChanged(campaignId);
}

export async function stopJukebox(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  await db
    .update(campaigns)
    .set({ jukeboxUrl: null, jukeboxTitolo: null })
    .where(eq(campaigns.id, campaignId));
  await broadcastJukeboxChanged(campaignId);
}

export async function deleteSessionNote(noteId: string) {
  const userId = await requireUserId();
  const [note] = await db
    .select()
    .from(campaignSessionNotes)
    .where(eq(campaignSessionNotes.id, noteId));
  if (!note) return;
  const membership = await requireMember(note.campaignId, userId);
  if (note.authorId !== userId && membership.role !== "dm") {
    throw new Error("Solo l'autore o il master possono eliminare questa nota.");
  }
  await db.delete(campaignSessionNotes).where(eq(campaignSessionNotes.id, noteId));
}
