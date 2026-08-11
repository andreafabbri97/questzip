"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireUserId } from "@/lib/campaign-auth";
import { campaignNpcs } from "@/lib/db/schema";

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
