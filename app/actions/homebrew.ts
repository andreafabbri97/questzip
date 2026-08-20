"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignHomebrew } from "@/lib/db/schema";

type HomebrewTipo = "mostro" | "oggetto" | "incantesimo";

// Stessa regola di visibilità di getHandoutsForCampaign (app/actions/handouts.ts): il master
// prepara le voci in anticipo, i giocatori vedono solo quelle già rivelate.
export async function getHomebrewForCampaign(campaignId: string) {
  const userId = await requireUserId();
  const membership = await requireMember(campaignId, userId);

  const rows = await db
    .select()
    .from(campaignHomebrew)
    .where(eq(campaignHomebrew.campaignId, campaignId))
    .orderBy(campaignHomebrew.createdAt);

  return membership.role === "dm" ? rows : rows.filter((h) => h.visibile);
}

export async function createHomebrewEntry(
  campaignId: string,
  tipo: HomebrewTipo,
  nome: string,
  descrizione: string,
  stats: { hpMax?: number; classeArmatura?: number; xp?: number } = {},
) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const [entry] = await db
    .insert(campaignHomebrew)
    .values({
      campaignId,
      createdBy: userId,
      tipo,
      nome: (nome.trim() || "Senza nome").slice(0, 100),
      descrizione: descrizione.slice(0, 10000),
      hpMax: tipo === "mostro" ? (stats.hpMax ?? null) : null,
      classeArmatura: tipo === "mostro" ? (stats.classeArmatura ?? null) : null,
      xp: tipo === "mostro" ? (stats.xp ?? null) : null,
    })
    .returning();
  return entry;
}

export async function updateHomebrewEntry(
  entryId: string,
  values: {
    nome: string;
    descrizione: string;
    hpMax?: number;
    classeArmatura?: number;
    xp?: number;
  },
) {
  const userId = await requireUserId();
  const [entry] = await db.select().from(campaignHomebrew).where(eq(campaignHomebrew.id, entryId));
  if (!entry) throw new Error("Voce homebrew non trovata.");
  await requireDm(entry.campaignId, userId);

  await db
    .update(campaignHomebrew)
    .set({
      nome: (values.nome.trim() || "Senza nome").slice(0, 100),
      descrizione: values.descrizione.slice(0, 10000),
      hpMax: entry.tipo === "mostro" ? (values.hpMax ?? null) : null,
      classeArmatura: entry.tipo === "mostro" ? (values.classeArmatura ?? null) : null,
      xp: entry.tipo === "mostro" ? (values.xp ?? null) : null,
    })
    .where(eq(campaignHomebrew.id, entryId));
}

export async function toggleHomebrewVisible(entryId: string) {
  const userId = await requireUserId();
  const [entry] = await db.select().from(campaignHomebrew).where(eq(campaignHomebrew.id, entryId));
  if (!entry) throw new Error("Voce homebrew non trovata.");
  await requireDm(entry.campaignId, userId);

  await db
    .update(campaignHomebrew)
    .set({ visibile: !entry.visibile })
    .where(eq(campaignHomebrew.id, entryId));
}

export async function deleteHomebrewEntry(entryId: string) {
  const userId = await requireUserId();
  const [entry] = await db.select().from(campaignHomebrew).where(eq(campaignHomebrew.id, entryId));
  if (!entry) return;
  await requireDm(entry.campaignId, userId);
  await db.delete(campaignHomebrew).where(eq(campaignHomebrew.id, entryId));
}
