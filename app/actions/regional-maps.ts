"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignRegionalMaps } from "@/lib/db/schema";
import { TERRAIN_TYPES, type RegionalMarker, type TerrainType } from "@/lib/regional-map";

// Nessun realtime qui (a differenza del dungeon): la mappa regionale è una risorsa di
// riferimento che il master prepara fra una sessione e l'altra, non qualcosa che cambia
// mentre i giocatori la guardano in diretta — un refresh manuale basta, come le note di
// sessione.

export async function createBlankRegionalMap(
  campaignId: string,
  nome: string,
  width: number,
  height: number,
) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);

  const w = Math.min(80, Math.max(8, Math.round(width)));
  const h = Math.min(80, Math.max(8, Math.round(height)));
  const cells: TerrainType[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "vuoto" as TerrainType),
  );
  const [map] = await db
    .insert(campaignRegionalMaps)
    .values({
      campaignId,
      createdBy: userId,
      nome: nome || `Mappa regionale ${new Date().toLocaleDateString("it-IT")}`,
      width: w,
      height: h,
      cells,
      markers: [],
    })
    .returning();
  return map;
}

export async function getRegionalMapsForCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);
  return db
    .select({
      id: campaignRegionalMaps.id,
      nome: campaignRegionalMaps.nome,
      createdAt: campaignRegionalMaps.createdAt,
    })
    .from(campaignRegionalMaps)
    .where(eq(campaignRegionalMaps.campaignId, campaignId));
}

export async function getRegionalMap(mapId: string) {
  const userId = await requireUserId();
  const [map] = await db
    .select()
    .from(campaignRegionalMaps)
    .where(eq(campaignRegionalMaps.id, mapId));
  if (!map) throw new Error("Mappa non trovata.");
  await requireMember(map.campaignId, userId);
  return map;
}

export async function updateRegionalMapCells(mapId: string, cells: TerrainType[][]) {
  const userId = await requireUserId();
  const [map] = await db
    .select()
    .from(campaignRegionalMaps)
    .where(eq(campaignRegionalMaps.id, mapId));
  if (!map) throw new Error("Mappa non trovata.");
  await requireDm(map.campaignId, userId);

  if (cells.length !== map.height || cells.some((row) => row.length !== map.width)) {
    throw new Error("Dimensioni della mappa non valide.");
  }
  const validCells = new Set<string>(TERRAIN_TYPES);
  if (cells.some((row) => row.some((cell) => !validCells.has(cell)))) {
    throw new Error("Contenuto della mappa non valido.");
  }
  // Come per le celle del dungeon: qui si sostituisce la griglia INTERA, quindi riprovare
  // cancellerebbe comunque il disegno dell'altro — il conflitto si dichiara, non si riapplica.
  const scritte = await db
    .update(campaignRegionalMaps)
    .set({ cells, version: map.version + 1 })
    .where(and(eq(campaignRegionalMaps.id, mapId), eq(campaignRegionalMaps.version, map.version)))
    .returning({ id: campaignRegionalMaps.id });
  if (scritte.length === 0) {
    throw new Error(
      "Qualcun altro ha modificato questa mappa mentre la stavi disegnando: ricarica la pagina per non sovrascrivere il suo lavoro.",
    );
  }
}


// Stesso schema di app/actions/dungeons.ts (vedi il commento esteso lì): i marcatori vivono in un
// jsonb letto e riscritto per intero, quindi due scritture contemporanee si sovrascrivevano in
// silenzio. Si scrive solo se la versione letta è ancora quella attuale, altrimenti si rilegge e
// si riapplica la stessa modifica sullo stato aggiornato.
const MAX_TENTATIVI = 5;

async function aggiornaMappa<R>(
  mapId: string,
  applica: (map: typeof campaignRegionalMaps.$inferSelect) => {
    set: Partial<typeof campaignRegionalMaps.$inferInsert>;
    risultato: R;
  },
): Promise<R> {
  const userId = await requireUserId();
  for (let tentativo = 0; tentativo < MAX_TENTATIVI; tentativo++) {
    const [map] = await db
      .select()
      .from(campaignRegionalMaps)
      .where(eq(campaignRegionalMaps.id, mapId));
    if (!map) throw new Error("Mappa non trovata.");
    await requireDm(map.campaignId, userId);

    const { set, risultato } = applica(map);
    const scritte = await db
      .update(campaignRegionalMaps)
      .set({ ...set, version: map.version + 1 })
      .where(and(eq(campaignRegionalMaps.id, mapId), eq(campaignRegionalMaps.version, map.version)))
      .returning({ id: campaignRegionalMaps.id });
    if (scritte.length > 0) return risultato;
  }
  throw new Error("Qualcun altro sta modificando questa mappa proprio ora: riprova fra un istante.");
}

export async function addRegionalMarker(
  mapId: string,
  x: number,
  y: number,
  label: string,
  icona: string,
) {
  return aggiornaMappa(mapId, (map) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
      throw new Error("Punto fuori dalla mappa.");
    }
    // Ricalcolato ad ogni tentativo, così un marcatore aggiunto nel frattempo da qualcun altro
    // non fa nascere due marcatori con lo stesso id.
    const nextId = map.markers.reduce((max, m) => Math.max(max, m.id), -1) + 1;
    const marker: RegionalMarker = {
      id: nextId,
      x,
      y,
      label: label.trim().slice(0, 200) || `Punto ${nextId + 1}`,
      icona: icona || "⭐",
      nota: "",
    };
    return { set: { markers: [...map.markers, marker] }, risultato: marker };
  });
}

export async function updateRegionalMarkerNote(mapId: string, markerId: number, nota: string) {
  await aggiornaMappa(mapId, (map) => ({
    set: {
      markers: map.markers.map((m) =>
        m.id === markerId ? { ...m, nota: nota.slice(0, 10000) } : m,
      ),
    },
    risultato: undefined,
  }));
}

export async function deleteRegionalMarker(mapId: string, markerId: number) {
  await aggiornaMappa(mapId, (map) => ({
    set: { markers: map.markers.filter((m) => m.id !== markerId) },
    risultato: undefined,
  }));
}

export async function deleteRegionalMap(mapId: string) {
  const userId = await requireUserId();
  const [map] = await db
    .select()
    .from(campaignRegionalMaps)
    .where(eq(campaignRegionalMaps.id, mapId));
  if (!map) return;
  await requireDm(map.campaignId, userId);
  await db.delete(campaignRegionalMaps).where(eq(campaignRegionalMaps.id, mapId));
}
