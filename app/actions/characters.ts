"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignCharacters, users } from "@/lib/db/schema";
import type { Character } from "@/lib/dnd";

export async function syncCharacterToCampaign(campaignId: string, character: Character) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);

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
      updatedAt: campaignCharacters.updatedAt,
    })
    .from(campaignCharacters)
    .innerJoin(users, eq(campaignCharacters.userId, users.id))
    .where(eq(campaignCharacters.campaignId, campaignId));
}

export async function removeMyCharacterFromCampaign(campaignId: string) {
  const userId = await requireUserId();
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
