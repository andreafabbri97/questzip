"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignCharacters, campaignDungeons, dungeonTokens, users } from "@/lib/db/schema";
import {
  CELL_TYPES,
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

/** Raggio di visione in celle, oppure undefined per lasciare il fallback al raggio predefinito.
 * Deliberatamente undefined anche per 0: l'app non modella le sorgenti di luce, quindi "nessuna
 * scurovisione" non deve voler dire "cieco". */
function visionRadiusCells(meters: number | null): number | undefined {
  if (!meters || meters <= 0) return undefined;
  return metersToCells(meters);
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
      // undefined (non 0!) quando manca un raggio reale: computeVisibleCells usa "?? fallback",
      // e 0 NON è nullish — un giocatore senza personaggio sincronizzato, o senza scurovisione,
      // finiva con raggio 0, cioè mappa completamente nera e nessun mostro visibile nemmeno sotto
      // il proprio token. Il commento qui sopra dichiarava già questo comportamento, il codice no.
      radius: dungeon.realisticMode ? visionRadiusCells(p.visioneRadiusMeters) : undefined,
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


// --- Scritture concorrenti sui campi jsonb ------------------------------------------------
//
// rooms/revealedRooms/monsterTokens si modificano leggendo l'array intero, cambiandolo in JS e
// riscrivendolo: due scritture contemporanee (il master su laptop e telefono, o due master) si
// sovrascrivevano a vicenda IN SILENZIO — chi scriveva per secondo partiva da una copia letta
// prima dell'altra modifica, che spariva senza alcun errore.
//
// Il driver Neon HTTP non offre transazioni, ma un singolo UPDATE con WHERE sulla versione è
// comunque atomico: si scrive solo se la riga è ancora quella che si è letta, altrimenti si
// rilegge e si RIAPPLICA la modifica sullo stato aggiornato. Funziona perché tutte queste
// mutazioni sono espresse come "applica questo cambiamento a qualunque sia lo stato attuale"
// (aggiungi un marcatore, togli il token con questo id, cambia la nota di questa stanza), quindi
// riapplicarle su dati più freschi dà il risultato giusto senza che l'utente si accorga di nulla.
const MAX_TENTATIVI = 5;

type Dungeon = typeof campaignDungeons.$inferSelect;

async function aggiornaDungeon<R>(
  dungeonId: string,
  applica: (dungeon: Dungeon) => { set: Partial<typeof campaignDungeons.$inferInsert>; risultato: R },
): Promise<R> {
  const userId = await requireUserId();
  for (let tentativo = 0; tentativo < MAX_TENTATIVI; tentativo++) {
    const [dungeon] = await db
      .select()
      .from(campaignDungeons)
      .where(eq(campaignDungeons.id, dungeonId));
    if (!dungeon) throw new Error("Dungeon non trovato.");
    await requireDm(dungeon.campaignId, userId);

    const { set, risultato } = applica(dungeon);
    const scritte = await db
      .update(campaignDungeons)
      .set({ ...set, version: dungeon.version + 1 })
      .where(and(eq(campaignDungeons.id, dungeonId), eq(campaignDungeons.version, dungeon.version)))
      .returning({ id: campaignDungeons.id });
    if (scritte.length > 0) {
      await broadcastDungeonChanged(dungeonId);
      return risultato;
    }
  }
  throw new Error(
    "Qualcun altro sta modificando questa mappa proprio ora: riprova fra un istante.",
  );
}

export async function updateRoomNotes(
  dungeonId: string,
  roomId: number,
  values: { encounter: string; reward: string },
) {
  await aggiornaDungeon(dungeonId, (dungeon) => ({
    set: {
      rooms: dungeon.rooms.map((room) =>
        room.id === roomId
          ? {
              ...room,
              encounter: values.encounter.slice(0, 10000),
              reward: values.reward.slice(0, 10000),
            }
          : room,
      ),
    },
    risultato: undefined,
  }));
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
  const validCells = new Set<string>(CELL_TYPES);
  if (cells.some((row) => row.some((cell) => !validCells.has(cell)))) {
    throw new Error("Contenuto della mappa non valido.");
  }
  // A differenza delle mutazioni per-elemento qui sopra, questa SOSTITUISCE l'intera griglia:
  // riapplicarla su dati più freschi cancellerebbe comunque quello che l'altro ha disegnato.
  // Quindi il conflitto NON si riprova, si dichiara — meglio far ricaricare che far sparire in
  // silenzio il lavoro di qualcuno.
  const scritte = await db
    .update(campaignDungeons)
    .set({ cells, version: dungeon.version + 1 })
    .where(and(eq(campaignDungeons.id, dungeonId), eq(campaignDungeons.version, dungeon.version)))
    .returning({ id: campaignDungeons.id });
  if (scritte.length === 0) {
    throw new Error(
      "Qualcun altro ha modificato questa mappa mentre la stavi disegnando: ricarica la pagina per non sovrascrivere il suo lavoro.",
    );
  }
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
  // L'id progressivo viene ricalcolato ad ogni tentativo: se nel frattempo qualcun altro ha
  // aggiunto un marcatore, il nuovo prende comunque un id libero invece di duplicarne uno.
  return aggiornaDungeon(dungeonId, (d) => {
    const nextId = d.rooms.reduce((max, room) => Math.max(max, room.id), -1) + 1;
    const marker: DungeonRoom = {
      id: nextId,
      label: label.trim().slice(0, 200) || `Punto ${nextId + 1}`,
      cells: [[x, y]],
      centerX: x,
      centerY: y,
      encounter: "",
      reward: "",
    };
    return { set: { rooms: [...d.rooms, marker] }, risultato: marker };
  });
}

export async function deleteMarker(dungeonId: string, roomId: number) {
  await aggiornaDungeon(dungeonId, (dungeon) => ({
    set: { rooms: dungeon.rooms.filter((room) => room.id !== roomId) },
    risultato: undefined,
  }));
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
  await aggiornaDungeon(dungeonId, (dungeon) => ({
    set: {
      revealedRooms: dungeon.revealedRooms.includes(roomId)
        ? dungeon.revealedRooms.filter((id) => id !== roomId)
        : [...dungeon.revealedRooms, roomId],
    },
    risultato: undefined,
  }));
}

// --- Token mostro piazzati dal master: posizione persistita al rilascio, niente relay
// per-frame (solo il master li muove, non serve la fluidità in tempo reale dei token
// giocatore) — l'aggiornamento arriva agli altri client via lo stesso broadcast delle celle.

export async function placeMonsterToken(dungeonId: string, nome: string, x: number, y: number) {
  return aggiornaDungeon(dungeonId, (dungeon) => {
    if (x < 0 || y < 0 || x >= dungeon.width || y >= dungeon.height) {
      throw new Error("Punto fuori dalla mappa.");
    }
    const colors = ["#c0392b", "#8e44ad", "#16a085", "#d35400", "#2c3e50"];
    const token: MonsterToken = {
      id: crypto.randomUUID(),
      nome: nome.trim().slice(0, 100) || "Mostro",
      x,
      y,
      colore: colors[dungeon.monsterTokens.length % colors.length],
    };
    return { set: { monsterTokens: [...dungeon.monsterTokens, token] }, risultato: token };
  });
}

export async function moveMonsterToken(dungeonId: string, tokenId: string, x: number, y: number) {
  await aggiornaDungeon(dungeonId, (dungeon) => {
    const cx = Math.min(dungeon.width - 1, Math.max(0, Math.round(x)));
    const cy = Math.min(dungeon.height - 1, Math.max(0, Math.round(y)));
    return {
      set: {
        monsterTokens: dungeon.monsterTokens.map((t) =>
          t.id === tokenId ? { ...t, x: cx, y: cy } : t,
        ),
      },
      risultato: undefined,
    };
  });
}

export async function removeMonsterToken(dungeonId: string, tokenId: string) {
  await aggiornaDungeon(dungeonId, (dungeon) => ({
    set: { monsterTokens: dungeon.monsterTokens.filter((t) => t.id !== tokenId) },
    risultato: undefined,
  }));
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
