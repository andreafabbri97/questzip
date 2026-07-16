"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireDm, requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignRollTables, type RollTableEntry } from "@/lib/db/schema";

export async function getRollTablesForCampaign(campaignId: string) {
  const userId = await requireUserId();
  await requireMember(campaignId, userId);
  return db
    .select()
    .from(campaignRollTables)
    .where(eq(campaignRollTables.campaignId, campaignId))
    .orderBy(campaignRollTables.createdAt);
}

export async function createRollTable(campaignId: string, nome: string) {
  const userId = await requireUserId();
  await requireDm(campaignId, userId);
  const [table] = await db
    .insert(campaignRollTables)
    .values({ campaignId, createdBy: userId, nome: nome.trim() || "Tabella senza nome", voci: [] })
    .returning();
  return table;
}

export async function updateRollTable(tableId: string, nome: string, voci: RollTableEntry[]) {
  const userId = await requireUserId();
  const [table] = await db
    .select()
    .from(campaignRollTables)
    .where(eq(campaignRollTables.id, tableId));
  if (!table) throw new Error("Tabella non trovata.");
  await requireDm(table.campaignId, userId);

  await db
    .update(campaignRollTables)
    .set({ nome: nome.trim() || "Tabella senza nome", voci })
    .where(eq(campaignRollTables.id, tableId));
}

export async function deleteRollTable(tableId: string) {
  const userId = await requireUserId();
  const [table] = await db
    .select()
    .from(campaignRollTables)
    .where(eq(campaignRollTables.id, tableId));
  if (!table) return;
  await requireDm(table.campaignId, userId);
  await db.delete(campaignRollTables).where(eq(campaignRollTables.id, tableId));
}
