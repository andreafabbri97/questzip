"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignDungeons, dungeonTokens, users } from "@/lib/db/schema";
import {
  generateDungeon,
  type CellType,
  type DungeonConfig,
  type DungeonRoom,
  type MonsterToken,
} from "@/lib/dungeon";
import { broadcastDungeonChanged, broadcastDungeonDeleted } from "@/lib/party";

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
  const membership = await requireMember(dungeon.campaignId, userId);

  if (membership.role === "dm" || !dungeon.fogOfWar) return dungeon;

  // Fog attiva e non sei il master: nascondi anche lato server ciò che il client nasconderebbe
  // comunque, così un giocatore che ispeziona il traffico di rete non legge note di stanze/
  // mostri non ancora rivelati — la sola UI non basta a proteggerli.
  const revealedSet = new Set(dungeon.revealedRooms);
  const hiddenCellKeys = new Set<string>();
  const rooms = dungeon.rooms.map((room) => {
    if (revealedSet.has(room.id)) return room;
    for (const [x, y] of room.cells) hiddenCellKeys.add(`${x},${y}`);
    return { ...room, encounter: "", reward: "" };
  });
  const cells = dungeon.cells.map((row, y) =>
    row.map((cell, x) => (hiddenCellKeys.has(`${x},${y}`) ? "wall" : cell)),
  );
  const monsterTokens = dungeon.monsterTokens.filter(
    (m) => !hiddenCellKeys.has(`${m.x},${m.y}`),
  );

  return { ...dungeon, rooms, cells, monsterTokens };
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
  await broadcastDungeonChanged(dungeonId);
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
  await broadcastDungeonChanged(dungeonId);
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
  await broadcastDungeonChanged(dungeonId);
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
  await broadcastDungeonChanged(dungeonId);
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
  await broadcastDungeonDeleted(dungeonId);
}

// --- Fog of war semplificata: reveal a livello di stanza, non vera dynamic lighting ---

export async function setFogOfWar(dungeonId: string, enabled: boolean) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select({ campaignId: campaignDungeons.campaignId })
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  await db.update(campaignDungeons).set({ fogOfWar: enabled }).where(eq(campaignDungeons.id, dungeonId));
  await broadcastDungeonChanged(dungeonId);
}

export async function toggleRoomRevealed(dungeonId: string, roomId: number) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  const revealedRooms = dungeon.revealedRooms.includes(roomId)
    ? dungeon.revealedRooms.filter((id) => id !== roomId)
    : [...dungeon.revealedRooms, roomId];
  await db
    .update(campaignDungeons)
    .set({ revealedRooms })
    .where(eq(campaignDungeons.id, dungeonId));
  await broadcastDungeonChanged(dungeonId);
}

// --- Token mostro piazzati dal master: posizione persistita al rilascio, niente relay
// per-frame (solo il master li muove, non serve la fluidità in tempo reale dei token
// giocatore) — l'aggiornamento arriva agli altri client via lo stesso broadcast delle celle.

export async function placeMonsterToken(dungeonId: string, nome: string, x: number, y: number) {
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
  const colors = ["#c0392b", "#8e44ad", "#16a085", "#d35400", "#2c3e50"];
  const token: MonsterToken = {
    id: crypto.randomUUID(),
    nome: nome.trim() || "Mostro",
    x,
    y,
    colore: colors[dungeon.monsterTokens.length % colors.length],
  };
  const monsterTokens = [...dungeon.monsterTokens, token];
  await db.update(campaignDungeons).set({ monsterTokens }).where(eq(campaignDungeons.id, dungeonId));
  await broadcastDungeonChanged(dungeonId);
  return token;
}

export async function moveMonsterToken(dungeonId: string, tokenId: string, x: number, y: number) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  const cx = Math.min(dungeon.width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(dungeon.height - 1, Math.max(0, Math.round(y)));
  const monsterTokens = dungeon.monsterTokens.map((t) =>
    t.id === tokenId ? { ...t, x: cx, y: cy } : t,
  );
  await db.update(campaignDungeons).set({ monsterTokens }).where(eq(campaignDungeons.id, dungeonId));
  await broadcastDungeonChanged(dungeonId);
}

export async function removeMonsterToken(dungeonId: string, tokenId: string) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  const monsterTokens = dungeon.monsterTokens.filter((t) => t.id !== tokenId);
  await db.update(campaignDungeons).set({ monsterTokens }).where(eq(campaignDungeons.id, dungeonId));
  await broadcastDungeonChanged(dungeonId);
}

// --- Token della lavagna condivisa: posizione persistita, movimento live via PartyKit ---

export async function getDungeonTokens(dungeonId: string) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select({ campaignId: campaignDungeons.campaignId })
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireMember(dungeon.campaignId, userId);

  return db
    .select({
      userId: dungeonTokens.userId,
      x: dungeonTokens.x,
      y: dungeonTokens.y,
      name: users.name,
      image: users.image,
    })
    .from(dungeonTokens)
    .innerJoin(users, eq(dungeonTokens.userId, users.id))
    .where(eq(dungeonTokens.dungeonId, dungeonId));
}

export async function upsertMyToken(dungeonId: string, x: number, y: number) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select()
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireMember(dungeon.campaignId, userId);

  const cx = Math.min(dungeon.width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(dungeon.height - 1, Math.max(0, Math.round(y)));
  await db
    .insert(dungeonTokens)
    .values({ dungeonId, userId, x: cx, y: cy })
    .onConflictDoUpdate({
      target: [dungeonTokens.dungeonId, dungeonTokens.userId],
      set: { x: cx, y: cy, updatedAt: new Date() },
    });
}

export async function removeMyToken(dungeonId: string) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select({ campaignId: campaignDungeons.campaignId })
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) return;
  await requireMember(dungeon.campaignId, userId);
  await db
    .delete(dungeonTokens)
    .where(and(eq(dungeonTokens.dungeonId, dungeonId), eq(dungeonTokens.userId, userId)));
}
