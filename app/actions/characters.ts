"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignCharacters, users } from "@/lib/db/schema";
import type { Character } from "@/lib/dnd";

export async function syncCharacterToCampaign(campaignId: string, character: Character) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);

  // NON includere qui xpInSospeso/xpAutoLevel: sono una "casella postale" scritta solo dal
  // master (vedi grantXp/grantXpToParty) — se il push del giocatore le toccasse, una sync fatta
  // dopo che il master ha assegnato XP la azzererebbe di nuovo prima ancora che il giocatore
  // se ne accorga. Restano fuori da questo oggetto apposta, non per dimenticanza.
  const values = {
    campaignId,
    userId,
    nome: character.nome,
    razza: character.razza,
    classi: character.classi,
    hpMax: character.hpMax,
    hpAttuali: character.hpAttuali,
    classeArmatura: character.classeArmatura,
    velocita: character.velocita,
    caratteristiche: character.caratteristiche,
    slotUsati: character.slotUsati,
    slotPattoUsati: character.slotPattoUsati,
    esperienza: character.esperienza,
    note: character.note,
    updatedAt: new Date(),
  };

  await db
    .insert(campaignCharacters)
    .values(values)
    .onConflictDoUpdate({
      target: [campaignCharacters.campaignId, campaignCharacters.userId],
      set: values,
    });
}

export async function getPartyForCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);

  return db
    .select({
      userId: campaignCharacters.userId,
      playerName: users.name,
      nome: campaignCharacters.nome,
      razza: campaignCharacters.razza,
      classi: campaignCharacters.classi,
      hpMax: campaignCharacters.hpMax,
      hpAttuali: campaignCharacters.hpAttuali,
      classeArmatura: campaignCharacters.classeArmatura,
      caratteristiche: campaignCharacters.caratteristiche,
      slotUsati: campaignCharacters.slotUsati,
      slotPattoUsati: campaignCharacters.slotPattoUsati,
      esperienza: campaignCharacters.esperienza,
      xpInSospeso: campaignCharacters.xpInSospeso,
      updatedAt: campaignCharacters.updatedAt,
    })
    .from(campaignCharacters)
    .innerJoin(users, eq(campaignCharacters.userId, users.id))
    .where(eq(campaignCharacters.campaignId, campaignId));
}

export async function removeMyCharacterFromCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);
  await db
    .delete(campaignCharacters)
    .where(and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.userId, userId)));
}

export async function getMyCharacterInCampaign(campaignId: string) {
  const userId = await requireUserId();
  const [row] = await db
    .select()
    .from(campaignCharacters)
    .where(and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.userId, userId)));
  return row ?? null;
}

// --- XP assegnata dal master: "casella postale" (xpInSospeso) separata dal resto della riga,
// vedi il commento su syncCharacterToCampaign. Solo il master scrive qui, solo il giocatore
// (sulla propria riga) la reclama.

export async function grantXp(
  campaignId: string,
  targetUserId: string,
  amount: number,
  autoLevelUp: boolean,
) {
  const dmId = await requireUserId();
  await requireDm(campaignId, dmId);
  if (amount <= 0) return;

  const [updated] = await db
    .update(campaignCharacters)
    .set({ xpInSospeso: sql`${campaignCharacters.xpInSospeso} + ${amount}`, xpAutoLevel: autoLevelUp })
    .where(
      and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.userId, targetUserId)),
    )
    .returning({ userId: campaignCharacters.userId });

  // UPDATE su 0 righe non genera errori di suo: senza questo controllo il master vedrebbe
  // "✓ Assegnato" anche se il giocatore non ha ancora sincronizzato un personaggio in campagna.
  if (!updated) throw new Error("Il giocatore non ha ancora sincronizzato un personaggio in questa campagna.");
}

// userIds: chi ha davvero partecipato (di solito i characterUserId dei combattenti-PG
// dell'incontro appena concluso) — SENZA questo filtro finirebbe per assegnare XP anche ai
// personaggi sincronizzati ma assenti da quella sessione/incontro, non solo a chi ha combattuto.
export async function grantXpToParty(
  campaignId: string,
  perPlayerAmount: number,
  autoLevelUp: boolean,
  userIds: string[],
) {
  const dmId = await requireUserId();
  await requireDm(campaignId, dmId);
  if (perPlayerAmount <= 0 || userIds.length === 0) return;

  const updated = await db
    .update(campaignCharacters)
    .set({ xpInSospeso: sql`${campaignCharacters.xpInSospeso} + ${perPlayerAmount}`, xpAutoLevel: autoLevelUp })
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        inArray(campaignCharacters.userId, userIds),
      ),
    )
    .returning({ userId: campaignCharacters.userId });

  // Come per grantXp: se qualcuno dei partecipanti non ha (più) un personaggio sincronizzato
  // (es. si è rimosso dalla campagna tra la fine del combattimento e l'assegnazione XP), l'UPDATE
  // lo salta silenziosamente — segnalalo invece di far credere che sia andato tutto a buon fine.
  if (updated.length < userIds.length) {
    throw new Error(
      updated.length === 0
        ? "Nessuno dei giocatori selezionati ha un personaggio sincronizzato in questa campagna."
        : `XP assegnata solo a ${updated.length} su ${userIds.length} giocatori: qualcuno non ha (più) un personaggio sincronizzato.`,
    );
  }
}

export async function claimXp(campaignId: string) {
  const userId = await requireUserId();
  const [row] = await db
    .select({ xpInSospeso: campaignCharacters.xpInSospeso, xpAutoLevel: campaignCharacters.xpAutoLevel })
    .from(campaignCharacters)
    .where(and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.userId, userId)));
  if (!row || row.xpInSospeso <= 0) return { amount: 0, autoLevelUp: false };

  await db
    .update(campaignCharacters)
    .set({ xpInSospeso: 0 })
    .where(and(eq(campaignCharacters.campaignId, campaignId), eq(campaignCharacters.userId, userId)));

  return { amount: row.xpInSospeso, autoLevelUp: row.xpAutoLevel };
}
