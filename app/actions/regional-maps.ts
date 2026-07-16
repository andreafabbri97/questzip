"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignRegionalMaps } from "@/lib/db/schema";
import type { RegionalMarker, TerrainType } from "@/lib/regional-map";

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
  await db.update(campaignRegionalMaps).set({ cells }).where(eq(campaignRegionalMaps.id, mapId));
}

export async function addRegionalMarker(
  mapId: string,
  x: number,
  y: number,
  label: string,
  icona: string,
) {
  const userId = await requireUserId();
  const [map] = await db
    .select()
    .from(campaignRegionalMaps)
    .where(eq(campaignRegionalMaps.id, mapId));
  if (!map) throw new Error("Mappa non trovata.");
  await requireDm(map.campaignId, userId);

  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    throw new Error("Punto fuori dalla mappa.");
  }
  const nextId = map.markers.reduce((max, m) => Math.max(max, m.id), -1) + 1;
  const marker: RegionalMarker = {
    id: nextId,
    x,
    y,
    label: label.trim() || `Punto ${nextId + 1}`,
    icona: icona || "⭐",
    nota: "",
  };
  const markers = [...map.markers, marker];
  await db.update(campaignRegionalMaps).set({ markers }).where(eq(campaignRegionalMaps.id, mapId));
  return marker;
}

export async function updateRegionalMarkerNote(mapId: string, markerId: number, nota: string) {
  const userId = await requireUserId();
  const [map] = await db
    .select()
    .from(campaignRegionalMaps)
    .where(eq(campaignRegionalMaps.id, mapId));
  if (!map) throw new Error("Mappa non trovata.");
  await requireDm(map.campaignId, userId);

  const markers = map.markers.map((m) => (m.id === markerId ? { ...m, nota } : m));
  await db.update(campaignRegionalMaps).set({ markers }).where(eq(campaignRegionalMaps.id, mapId));
}

export async function deleteRegionalMarker(mapId: string, markerId: number) {
  const userId = await requireUserId();
  const [map] = await db
    .select()
    .from(campaignRegionalMaps)
    .where(eq(campaignRegionalMaps.id, mapId));
  if (!map) throw new Error("Mappa non trovata.");
  await requireDm(map.campaignId, userId);

  const markers = map.markers.filter((m) => m.id !== markerId);
  await db.update(campaignRegionalMaps).set({ markers }).where(eq(campaignRegionalMaps.id, mapId));
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
