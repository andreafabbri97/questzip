"use server";

import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { broadcastEncounterChanged } from "@/lib/party";
import {
  campaignCharacters,
  campaignEncounters,
  encounterCombatants,
} from "@/lib/db/schema";

async function requireDmForEncounter(encounterId: string, userId: string) {
  const [encounter] = await db
    .select()
    .from(campaignEncounters)
    .where(eq(campaignEncounters.id, encounterId));
  if (!encounter) throw new Error("Combattimento non trovato.");
  await requireDm(encounter.campaignId, userId);
  return encounter;
}

async function getSortedCombatantIds(encounterId: string) {
  const rows = await db
    .select({ id: encounterCombatants.id })
    .from(encounterCombatants)
    .where(eq(encounterCombatants.encounterId, encounterId))
    .orderBy(desc(encounterCombatants.iniziativa), asc(encounterCombatants.createdAt));
  return rows.map((r) => r.id);
}

// currentTurn è un indice nell'ordine di iniziativa, non un id — aggiungere, rimuovere o
// riordinare (cambio iniziativa a combattimento in corso) sposta chi occupa quella posizione.
// Senza riallineamento l'indicatore "è il turno di" resta sull'indice numerico e finisce per
// puntare silenziosamente a un combattente diverso da quello che stava davvero agendo.
async function realignCurrentTurn(encounterId: string, oldTurn: number, oldOrder: string[]) {
  const currentId = oldOrder[oldTurn] ?? null;
  const newOrder = await getSortedCombatantIds(encounterId);
  const nextTurnIndex =
    newOrder.length === 0
      ? 0
      : currentId !== null && newOrder.includes(currentId)
        ? newOrder.indexOf(currentId)
        : Math.min(oldTurn, newOrder.length - 1);
  await db
    .update(campaignEncounters)
    .set({ currentTurn: nextTurnIndex })
    .where(eq(campaignEncounters.id, encounterId));
}

export async function getActiveEncounter(campaignId: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);

  const [encounter] = await db
    .select()
    .from(campaignEncounters)
    .where(eq(campaignEncounters.campaignId, campaignId));
  if (!encounter) return null;

  const combatants = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.encounterId, encounter.id))
    .orderBy(desc(encounterCombatants.iniziativa), asc(encounterCombatants.createdAt));

  return { encounter, combatants };
}

export async function startEncounter(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);

  const [existing] = await db
    .select()
    .from(campaignEncounters)
    .where(eq(campaignEncounters.campaignId, campaignId));
  if (existing) return existing;

  const [encounter] = await db.insert(campaignEncounters).values({ campaignId }).returning();
  await broadcastEncounterChanged(campaignId);
  return encounter;
}

export async function endEncounter(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  await db.delete(campaignEncounters).where(eq(campaignEncounters.campaignId, campaignId));
  await broadcastEncounterChanged(campaignId);
}

export async function addCombatant(
  encounterId: string,
  combatant: {
    nome: string;
    iniziativa: number;
    hpMax: number;
    isPg?: boolean;
    azioniLeggendarieMax?: number;
    xp?: number;
  },
) {
  const userId = await requireUserId();
  const encounter = await requireDmForEncounter(encounterId, userId);
  const oldOrder = await getSortedCombatantIds(encounterId);
  await db.insert(encounterCombatants).values({
    encounterId,
    nome: combatant.nome,
    iniziativa: combatant.iniziativa,
    hpMax: combatant.hpMax,
    hpAttuali: combatant.hpMax,
    isPg: combatant.isPg ?? false,
    azioniLeggendarieMax: combatant.azioniLeggendarieMax ?? 0,
    xp: combatant.xp ?? 0,
  });
  await realignCurrentTurn(encounterId, encounter.currentTurn, oldOrder);
  await broadcastEncounterChanged(encounter.campaignId);
}

export async function addPartyToEncounter(encounterId: string, campaignId: string) {
  const userId = await requireUserId();
  const encounter = await requireDmForEncounter(encounterId, userId);

  const [party, already] = await Promise.all([
    db.select().from(campaignCharacters).where(eq(campaignCharacters.campaignId, campaignId)),
    db
      .select({ characterUserId: encounterCombatants.characterUserId })
      .from(encounterCombatants)
      .where(eq(encounterCombatants.encounterId, encounterId)),
  ]);
  const alreadyUserIds = new Set(already.map((c) => c.characterUserId).filter(Boolean));
  const toAdd = party.filter((pc) => !alreadyUserIds.has(pc.userId));
  if (toAdd.length === 0) return;

  const oldOrder = await getSortedCombatantIds(encounterId);
  await db.insert(encounterCombatants).values(
    toAdd.map((pc) => ({
      encounterId,
      nome: pc.nome,
      characterUserId: pc.userId,
      iniziativa: 10,
      hpMax: pc.hpMax,
      hpAttuali: pc.hpAttuali,
      isPg: true,
    })),
  );
  await realignCurrentTurn(encounterId, encounter.currentTurn, oldOrder);
  await broadcastEncounterChanged(campaignId);
}

export async function updateCombatant(
  combatantId: string,
  values: Partial<{
    iniziativa: number;
    hpAttuali: number;
    hpMax: number;
    nome: string;
    condizioni: string[];
    tiriMorteSuccessi: number;
    tiriMorteFallimenti: number;
    azioniLeggendarieMax: number;
    azioniLeggendarieUsate: number;
    concentrazione: string | null;
  }>,
) {
  const userId = await requireUserId();
  const [combatant] = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.id, combatantId));
  if (!combatant) throw new Error("Combattente non trovato.");
  const encounter = await requireDmForEncounter(combatant.encounterId, userId);
  // Solo un cambio di iniziativa altera l'ordine di turno — evita una query di riallineamento
  // in più per gli aggiornamenti frequenti che non lo toccano (HP, condizioni, tiri morte...).
  const oldOrder =
    values.iniziativa !== undefined ? await getSortedCombatantIds(combatant.encounterId) : null;
  await db.update(encounterCombatants).set(values).where(eq(encounterCombatants.id, combatantId));
  if (oldOrder) await realignCurrentTurn(combatant.encounterId, encounter.currentTurn, oldOrder);
  await broadcastEncounterChanged(encounter.campaignId);
}

export async function removeCombatant(combatantId: string) {
  const userId = await requireUserId();
  const [combatant] = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.id, combatantId));
  if (!combatant) return;
  const encounter = await requireDmForEncounter(combatant.encounterId, userId);
  const oldOrder = await getSortedCombatantIds(combatant.encounterId);
  await db.delete(encounterCombatants).where(eq(encounterCombatants.id, combatantId));
  await realignCurrentTurn(combatant.encounterId, encounter.currentTurn, oldOrder);
  await broadcastEncounterChanged(encounter.campaignId);
}

export async function nextTurn(encounterId: string) {
  const userId = await requireUserId();
  const encounter = await requireDmForEncounter(encounterId, userId);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(encounterCombatants)
    .where(eq(encounterCombatants.encounterId, encounterId));
  if (count === 0) return;

  // Aggiornamento in un'unica istruzione SQL che legge current_turn dalla riga al momento
  // dell'esecuzione (non da un valore letto prima in JS): due click quasi simultanei non
  // possono più "perdersi" leggendo entrambi lo stesso turno di partenza.
  await db
    .update(campaignEncounters)
    .set({
      currentTurn: sql`CASE WHEN ${campaignEncounters.currentTurn} + 1 >= ${count} THEN 0 ELSE ${campaignEncounters.currentTurn} + 1 END`,
      round: sql`CASE WHEN ${campaignEncounters.currentTurn} + 1 >= ${count} THEN ${campaignEncounters.round} + 1 ELSE ${campaignEncounters.round} END`,
    })
    .where(eq(campaignEncounters.id, encounterId));
  await broadcastEncounterChanged(encounter.campaignId);
}
