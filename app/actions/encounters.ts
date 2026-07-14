"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  campaignCharacters,
  campaignEncounters,
  campaignMembers,
  encounterCombatants,
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

async function requireMember(campaignId: string, userId: string) {
  const [member] = await db
    .select()
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  if (!member) throw new Error("Non fai parte di questa campagna.");
}

async function requireDmForEncounter(encounterId: string, userId: string) {
  const [encounter] = await db
    .select()
    .from(campaignEncounters)
    .where(eq(campaignEncounters.id, encounterId));
  if (!encounter) throw new Error("Combattimento non trovato.");
  await requireDm(encounter.campaignId, userId);
  return encounter;
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
  return encounter;
}

export async function endEncounter(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  await db.delete(campaignEncounters).where(eq(campaignEncounters.campaignId, campaignId));
}

export async function addCombatant(
  encounterId: string,
  combatant: { nome: string; iniziativa: number; hpMax: number; isPg?: boolean },
) {
  const userId = await requireUserId();
  await requireDmForEncounter(encounterId, userId);
  await db.insert(encounterCombatants).values({
    encounterId,
    nome: combatant.nome,
    iniziativa: combatant.iniziativa,
    hpMax: combatant.hpMax,
    hpAttuali: combatant.hpMax,
    isPg: combatant.isPg ?? false,
  });
}

export async function addPartyToEncounter(encounterId: string, campaignId: string) {
  const userId = await requireUserId();
  await requireDmForEncounter(encounterId, userId);

  const [party, already] = await Promise.all([
    db.select().from(campaignCharacters).where(eq(campaignCharacters.campaignId, campaignId)),
    db
      .select({ nome: encounterCombatants.nome })
      .from(encounterCombatants)
      .where(eq(encounterCombatants.encounterId, encounterId)),
  ]);
  const alreadyNames = new Set(already.map((c) => c.nome));
  const toAdd = party.filter((pc) => !alreadyNames.has(pc.nome));
  if (toAdd.length === 0) return;

  await db.insert(encounterCombatants).values(
    toAdd.map((pc) => ({
      encounterId,
      nome: pc.nome,
      iniziativa: 10,
      hpMax: pc.hpMax,
      hpAttuali: pc.hpAttuali,
      isPg: true,
    })),
  );
}

export async function updateCombatant(
  combatantId: string,
  values: Partial<{ iniziativa: number; hpAttuali: number; hpMax: number; nome: string }>,
) {
  const userId = await requireUserId();
  const [combatant] = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.id, combatantId));
  if (!combatant) throw new Error("Combattente non trovato.");
  await requireDmForEncounter(combatant.encounterId, userId);
  await db.update(encounterCombatants).set(values).where(eq(encounterCombatants.id, combatantId));
}

export async function removeCombatant(combatantId: string) {
  const userId = await requireUserId();
  const [combatant] = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.id, combatantId));
  if (!combatant) return;
  await requireDmForEncounter(combatant.encounterId, userId);
  await db.delete(encounterCombatants).where(eq(encounterCombatants.id, combatantId));
}

export async function nextTurn(encounterId: string) {
  const userId = await requireUserId();
  const encounter = await requireDmForEncounter(encounterId, userId);

  const combatants = await db
    .select()
    .from(encounterCombatants)
    .where(eq(encounterCombatants.encounterId, encounterId));
  if (combatants.length === 0) return;

  const nextIndex = encounter.currentTurn + 1;
  const wrapped = nextIndex >= combatants.length;
  await db
    .update(campaignEncounters)
    .set({
      currentTurn: wrapped ? 0 : nextIndex,
      round: wrapped ? encounter.round + 1 : encounter.round,
    })
    .where(eq(campaignEncounters.id, encounterId));
}
