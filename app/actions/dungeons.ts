"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaignDungeons, campaignMembers } from "@/lib/db/schema";
import { generateDungeon, type DungeonConfig } from "@/lib/dungeon";

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

async function requireMember(campaignId: string, userId: string) {
  const [member] = await db
    .select()
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  if (!member) throw new Error("Non fai parte di questa campagna.");
}

export async function createDungeon(campaignId: string, nome: string, config: DungeonConfig) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);

  const data = generateDungeon(config);
  const [dungeon] = await db
    .insert(campaignDungeons)
    .values({
      campaignId,
      createdBy: userId,
      nome: nome || `Dungeon ${new Date().toLocaleDateString("it-IT")}`,
      width: data.width,
      height: data.height,
      cells: data.cells,
      rooms: data.rooms,
    })
    .returning();
  return dungeon;
}

export async function getDungeonsForCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);
  return db
    .select({
      id: campaignDungeons.id,
      nome: campaignDungeons.nome,
      createdAt: campaignDungeons.createdAt,
    })
    .from(campaignDungeons)
    .where(eq(campaignDungeons.campaignId, campaignId));
}

export async function getDungeon(dungeonId: string) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireMember(dungeon.campaignId, userId);
  return dungeon;
}

export async function updateRoomNotes(
  dungeonId: string,
  roomId: number,
  values: { encounter: string; reward: string },
) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  const rooms = dungeon.rooms.map((room) =>
    room.id === roomId ? { ...room, encounter: values.encounter, reward: values.reward } : room,
  );
  await db.update(campaignDungeons).set({ rooms }).where(eq(campaignDungeons.id, dungeonId));
}

export async function deleteDungeon(dungeonId: string) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) return;
  await requireDm(dungeon.campaignId, userId);
  await db.delete(campaignDungeons).where(eq(campaignDungeons.id, dungeonId));
}
