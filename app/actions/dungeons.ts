"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignCharacters, campaignDungeons, dungeonTokens, users } from "@/lib/db/schema";
import {
  computeVisibleCells,
  generateDungeon,
  generateOutdoorScene,
  metersToCells,
  type CellType,
  type DungeonConfig,
  type DungeonRoom,
  type MonsterToken,
  type OutdoorConfig,
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

export async function createOutdoorScene(campaignId: string, nome: string, config: OutdoorConfig) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);

  const data = generateOutdoorScene({
    ...config,
    width: Math.min(60, Math.max(8, Math.round(config.width))),
    height: Math.min(60, Math.max(8, Math.round(config.height))),
  });
  const [dungeon] = await db
    .insert(campaignDungeons)
    .values({
      campaignId,
      createdBy: userId,
      nome: nome || `Scena ${new Date().toLocaleDateString("it-IT")}`,
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
  // mostri fuori dalla visuale attuale del party — la sola UI non basta a proteggerli. Visibile
  // = luce dinamica automatica (linea di vista + raggio di scurovisione dai token giocatore,
  // vedi computeVisibleCells) UNITA alle stanze rivelate a mano dal master (evento narrativo
  // indipendente dalla posizione dei token, es. una visione). Il NOME della stanza (label) va
  // azzerato come encounter/reward quando è fuori da entrambe: nessun uso legittimo lo richiede
  // finché è nascosta. Forma/posizione (cells/centerX/centerY/vectorShape) restano invece
  // intenzionalmente — il client disegna comunque una sagoma scura piena per le stanze non
  // visibili (si vede "che c'è qualcosa qui", non cosa), design deliberato di questa fog of war.
  // In modalità realistica, ogni giocatore vede secondo la SUA visione (da campaignCharacters,
  // sincronizzata dalla scheda) invece di un raggio fisso uguale per tutti — leftJoin perché un
  // token può esistere senza uno snapshot di personaggio sincronizzato (in quel caso ricade sul
  // raggio fisso via "radius: undefined", vedi computeVisibleCells).
  const playerPositions = await db
    .select({
      x: dungeonTokens.x,
      y: dungeonTokens.y,
      visioneRadiusMeters: campaignCharacters.visioneRadius,
    })
    .from(dungeonTokens)
    .leftJoin(
      campaignCharacters,
      and(
        eq(campaignCharacters.userId, dungeonTokens.userId),
        eq(campaignCharacters.campaignId, dungeon.campaignId),
      ),
    )
    .where(eq(dungeonTokens.dungeonId, dungeonId));
  const autoVisible = computeVisibleCells(
    dungeon.cells,
    playerPositions.map((p) => ({
      x: p.x,
      y: p.y,
      radius: dungeon.realisticMode ? metersToCells(p.visioneRadiusMeters ?? 0) : undefined,
    })),
  );

  const revealedSet = new Set(dungeon.revealedRooms);
  const manuallyRevealedCellKeys = new Set<string>();
  for (const room of dungeon.rooms) {
    if (revealedSet.has(room.id)) {
      for (const [x, y] of room.cells) manuallyRevealedCellKeys.add(`${x},${y}`);
    }
  }
  const isCellVisible = (x: number, y: number) =>
    autoVisible.has(`${x},${y}`) || manuallyRevealedCellKeys.has(`${x},${y}`);

  const rooms = dungeon.rooms.map((room) => {
    const roomVisible = revealedSet.has(room.id) || room.cells.some(([x, y]) => autoVisible.has(`${x},${y}`));
    if (roomVisible) return room;
    return { ...room, label: "", encounter: "", reward: "" };
  });
  const cells = dungeon.cells.map((row, y) =>
    row.map((cell, x) => (isCellVisible(x, y) ? cell : "wall")),
  );
  const monsterTokens = dungeon.monsterTokens.filter((m) => isCellVisible(m.x, m.y));

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

export async function setRealisticMode(dungeonId: string, enabled: boolean) {
  const userId = await requireUserId();
  const [dungeon] = await db
    .select({ campaignId: campaignDungeons.campaignId })
    .from(campaignDungeons)
    .where(eq(campaignDungeons.id, dungeonId));
  if (!dungeon) throw new Error("Dungeon non trovato.");
  await requireDm(dungeon.campaignId, userId);

  await db
    .update(campaignDungeons)
    .set({ realisticMode: enabled })
    .where(eq(campaignDungeons.id, dungeonId));
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
