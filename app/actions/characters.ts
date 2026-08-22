"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignCharacters, campaigns, users } from "@/lib/db/schema";
import { createNotification } from "@/lib/notifications";
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
    // Valore EFFETTIVO usato dalla luce dinamica, non il numero grezzo in scheda: senza
    // "scurovisione" spuntata il personaggio non vede al buio anche se il campo Visione ha un
    // valore compilato (es. tenuto lì per un personaggio che potrebbe riguadagnarla in futuro).
    visioneRadius: character.scurovisione ? character.visioneRadius : 0,
    caratteristiche: character.caratteristiche,
    slotUsati: character.slotUsati,
    slotPattoUsati: character.slotPattoUsati,
    esperienza: character.esperienza,
    talenti: character.talenti,
    infusioniConosciute: character.infusioniConosciute,
    scelteClasse: character.scelteClasse,
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
      velocita: campaignCharacters.velocita,
      visioneRadius: campaignCharacters.visioneRadius,
      caratteristiche: campaignCharacters.caratteristiche,
      slotUsati: campaignCharacters.slotUsati,
      slotPattoUsati: campaignCharacters.slotPattoUsati,
      esperienza: campaignCharacters.esperienza,
      xpInSospeso: campaignCharacters.xpInSospeso,
      talenti: campaignCharacters.talenti,
      infusioniConosciute: campaignCharacters.infusioniConosciute,
      scelteClasse: campaignCharacters.scelteClasse,
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

  const [campaign] = await db.select({ nome: campaigns.nome }).from(campaigns).where(eq(campaigns.id, campaignId));
  await createNotification(targetUserId, "xp_granted", {
    campaignId,
    campaignNome: campaign?.nome ?? "",
    xp: amount,
  });
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

  // Il driver Neon HTTP non supporta le transazioni: un UPDATE parziale è GIÀ scritto quando
  // un'eccezione risale. Prima si aggiornava e poi si lanciava l'errore sul parziale — il master
  // vedeva "XP assegnata solo a 3 su 4", ripremeva il bottone (che resta abilitato) e i 3
  // giocatori validi incassavano il doppio. Ora si guarda PRIMA chi può davvero ricevere: se non
  // può nessuno si lancia senza aver scritto nulla (riprovare è sicuro), altrimenti si scrive per
  // quelli e il parziale viene RESTITUITO come avviso, non come errore.
  const presenti = await db
    .select({ userId: campaignCharacters.userId })
    .from(campaignCharacters)
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        inArray(campaignCharacters.userId, userIds),
      ),
    );
  if (presenti.length === 0) {
    throw new Error("Nessuno dei giocatori selezionati ha un personaggio sincronizzato in questa campagna.");
  }

  const updated = await db
    .update(campaignCharacters)
    .set({ xpInSospeso: sql`${campaignCharacters.xpInSospeso} + ${perPlayerAmount}`, xpAutoLevel: autoLevelUp })
    .where(
      and(
        eq(campaignCharacters.campaignId, campaignId),
        inArray(
          campaignCharacters.userId,
          presenti.map((r) => r.userId),
        ),
      ),
    )
    .returning({ userId: campaignCharacters.userId });

  const [campaign] = await db.select({ nome: campaigns.nome }).from(campaigns).where(eq(campaigns.id, campaignId));
  await Promise.all(
    updated.map((row) =>
      createNotification(row.userId, "xp_granted", {
        campaignId,
        campaignNome: campaign?.nome ?? "",
        xp: perPlayerAmount,
      }),
    ),
  );

  return { assegnati: updated.length, richiesti: userIds.length };
}

export async function claimXp(campaignId: string) {
  const userId = await requireUserId();
  // Un SELECT seguito da un UPDATE separato lascerebbe una finestra in cui il master può
  // depositare altro XP in sospeso fra la lettura e l'azzeramento — quell'importo verrebbe perso
  // silenziosamente, azzerato insieme al resto senza mai essere restituito al giocatore. Riletto
  // e azzerato nella stessa istruzione (FOR UPDATE blocca la riga per la durata della query),
  // niente finestra in cui un deposito concorrente possa infilarsi.
  const result = await db.execute<{ xp_in_sospeso: number; xp_auto_level: boolean }>(sql`
    WITH claimed AS (
      SELECT xp_in_sospeso, xp_auto_level
      FROM campaign_character
      WHERE campaign_id = ${campaignId} AND user_id = ${userId}
      FOR UPDATE
    )
    UPDATE campaign_character
    SET xp_in_sospeso = 0
    FROM claimed
    WHERE campaign_character.campaign_id = ${campaignId} AND campaign_character.user_id = ${userId}
    RETURNING claimed.xp_in_sospeso, claimed.xp_auto_level
  `);
  const row = result.rows[0];
  if (!row || row.xp_in_sospeso <= 0) return { amount: 0, autoLevelUp: false };

  return { amount: row.xp_in_sospeso, autoLevelUp: row.xp_auto_level };
}
