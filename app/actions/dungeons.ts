"use server";

import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaignDungeons, campaignMembers } from "@/lib/db/schema";
import { generateDungeon, type CellType, type DungeonConfig, type DungeonRoom } from "@/lib/dungeon";

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

export async function createBlankDungeon(campaignId: string, nome: string, width: number, height: number) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);

  const w = Math.min(60, Math.max(8, Math.round(width)));
  const h = Math.min(60, Math.max(8, Math.round(height)));
  const cells: CellType[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "wall" as CellType),
  );
  const [dungeon] = await db
    .insert(campaignDungeons)
    .values({
      campaignId,
      createdBy: userId,
      nome: nome || `Mappa ${new Date().toLocaleDateString("it-IT")}`,
      width: w,
      height: h,
      cells,
      rooms: [],
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

export async function updateDungeonCells(dungeonId: string, cells: CellType[][]) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  if (cells.length !== dungeon.height || cells.some((row) => row.length !== dungeon.width)) {
    throw new Error("Dimensioni della mappa non valide.");
  }
  await db.update(campaignDungeons).set({ cells }).where(eq(campaignDungeons.id, dungeonId));
}

export async function addMarker(dungeonId: string, x: number, y: number, label: string) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) {
    throw new Error("Punto fuori dalla mappa.");
  }
  const nextId = dungeon.rooms.reduce((max, room) => Math.max(max, room.id), -1) + 1;
  const marker: DungeonRoom = {
    id: nextId,
    label: label.trim() || `Punto ${nextId + 1}`,
    cells: [[x, y]],
    centerX: x,
    centerY: y,
    encounter: "",
    reward: "",
  };
  const rooms = [...dungeon.rooms, marker];
  await db.update(campaignDungeons).set({ rooms }).where(eq(campaignDungeons.id, dungeonId));
  return marker;
}

export async function deleteMarker(dungeonId: string, roomId: number) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  const rooms = dungeon.rooms.filter((room) => room.id !== roomId);
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
