"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/campaign-auth";
import { diceRolls } from "@/lib/db/schema";

// Stesso tetto di quando la cronologia viveva in localStorage — è pensata come "ultimi tiri
// recenti", non un registro permanente, non ha senso lasciarla crescere all'infinito.
const HISTORY_LIMIT = 30;

export async function getMyDiceRolls() {
  const userId = await requireUserId();
  return db
    .select()
    .from(diceRolls)
    .where(eq(diceRolls.userId, userId))
    .orderBy(desc(diceRolls.createdAt))
    .limit(HISTORY_LIMIT);
}

export async function saveDiceRoll(data: {
  die: number;
  quantity: number;
  modifier: number;
  mode: "normale" | "vantaggio" | "svantaggio";
  rolls: number[];
  discarded?: number;
  total: number;
  usedDice3D: boolean;
}) {
  const userId = await requireUserId();
  const [row] = await db
    .insert(diceRolls)
    .values({ userId, ...data })
    .returning();

  // Pota quello che eccede il tetto invece di lasciarlo accumulare — stessa politica di prima.
  const excess = await db
    .select({ id: diceRolls.id })
    .from(diceRolls)
    .where(eq(diceRolls.userId, userId))
    .orderBy(desc(diceRolls.createdAt))
    .offset(HISTORY_LIMIT);
  if (excess.length > 0) {
    await db.delete(diceRolls).where(
      inArray(
        diceRolls.id,
        excess.map((r) => r.id),
      ),
    );
  }

  return row;
}

export async function deleteDiceRoll(id: string) {
  const userId = await requireUserId();
  const [row] = await db.select().from(diceRolls).where(eq(diceRolls.id, id));
  if (!row || row.userId !== userId) return;
  await db.delete(diceRolls).where(eq(diceRolls.id, id));
}

export async function clearMyDiceRolls() {
  const userId = await requireUserId();
  await db.delete(diceRolls).where(eq(diceRolls.userId, userId));
}
