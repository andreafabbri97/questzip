"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  campaignInvites,
  campaignMembers,
  campaignSessionNotes,
  campaigns,
  users,
} from "@/lib/db/schema";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Devi accedere per continuare.");
  return session.user.id;
}

async function requireDm(campaignId: string, userId: string) {
  const [member] = await db
    .select()
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  if (!member || member.role !== "dm") throw new Error("Solo il master può farlo.");
}

export async function createCampaign(nome: string, descrizione: string) {
  const userId = await requireUserId();
  const [campaign] = await db
    .insert(campaigns)
    .values({ nome, descrizione, ownerId: userId })
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
  const [invite] = await db
    .insert(campaignInvites)
    .values({ campaignId, createdBy: userId })
    .returning();
  return invite.code;
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

export async function setMemberRole(
  campaignId: string,
  targetUserId: string,
  role: "dm" | "player",
) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
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
  const [membership] = await db
    .select()
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  if (!membership) throw new Error("Non fai parte di questa campagna.");
  await db.insert(campaignSessionNotes).values({ campaignId, authorId: userId, titolo, testo });
}

export async function deleteSessionNote(noteId: string) {
  await requireUserId();
  await db.delete(campaignSessionNotes).where(eq(campaignSessionNotes.id, noteId));
}
