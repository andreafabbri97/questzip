"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireUserId } from "@/lib/campaign-auth";
import { campaignNpcs } from "@/lib/db/schema";
import type { Character } from "@/lib/dnd";

// Solo per il master, come le altre due tabelle di app/actions/quests.ts e
// app/actions/session-prep.ts — vedi il commento sullo schema (lib/db/schema.ts) per il perché.

export async function getNpcsForCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  return db.select().from(campaignNpcs).where(eq(campaignNpcs.campaignId, campaignId)).orderBy(campaignNpcs.createdAt);
}

export async function createNpc(
  campaignId: string,
  nome: string,
  descrizione: string,
  posizione: string,
) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const [npc] = await db
    .insert(campaignNpcs)
    .values({
      campaignId,
      createdBy: userId,
      nome: (nome.trim() || "NPC senza nome").slice(0, 100),
      descrizione: descrizione.slice(0, 10000),
      posizione: posizione.trim().slice(0, 200),
    })
    .returning();
  return npc;
}

// Porta una scheda Personaggio COMPLETA (creata in Personaggi, con classe/statistiche vere) nella
// Rubrica NPC come villain o alleato — a differenza di syncCharacterToCampaign (app/actions/
// characters.ts) NON tocca campaignCharacters/Party: quella tabella è un utente reale (userId,
// una riga per persona), un NPC no. Il personaggio arriva già intero dal client (Personaggi vive
// solo in localStorage, il server non ce l'ha), qui si copia solo il sottoinsieme rilevante per un
// NPC — descrizione/posizione restano vuote apposta, il master le scrive dal punto di vista
// dell'NPC nel mondo, non riusa le note personali del personaggio originale.
export async function importCharacterAsNpc(campaignId: string, character: Character) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const [npc] = await db
    .insert(campaignNpcs)
    .values({
      campaignId,
      createdBy: userId,
      nome: character.nome.slice(0, 100) || "NPC senza nome",
      razza: character.razza,
      classi: character.classi,
      hpMax: character.hpMax,
      hpAttuali: character.hpAttuali,
      classeArmatura: character.classeArmatura,
      caratteristiche: character.caratteristiche,
      // La scheda intera accanto al riassunto: armi, incantesimi, abilità e privilegi restano
      // consultabili dalla campagna, senza tornare in Personaggi a cercarli.
      scheda: character,
    })
    .returning();
  return npc;
}

export async function updateNpc(
  npcId: string,
  values: {
    nome: string;
    descrizione: string;
    posizione: string;
    stato: "vivo" | "morto" | "scomparso" | "sconosciuto";
  },
) {
  const userId = await requireUserId();
  const [npc] = await db.select().from(campaignNpcs).where(eq(campaignNpcs.id, npcId));
  if (!npc) throw new Error("NPC non trovato.");
  await requireDm(npc.campaignId, userId);

  await db
    .update(campaignNpcs)
    .set({
      nome: (values.nome.trim() || "NPC senza nome").slice(0, 100),
      descrizione: values.descrizione.slice(0, 10000),
      posizione: values.posizione.trim().slice(0, 200),
      stato: values.stato,
    })
    .where(eq(campaignNpcs.id, npcId));
}

export async function deleteNpc(npcId: string) {
  const userId = await requireUserId();
  const [npc] = await db.select().from(campaignNpcs).where(eq(campaignNpcs.id, npcId));
  if (!npc) return;
  await requireDm(npc.campaignId, userId);
  await db.delete(campaignNpcs).where(eq(campaignNpcs.id, npcId));
}
