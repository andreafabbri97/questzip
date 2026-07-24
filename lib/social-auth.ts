import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships } from "@/lib/db/schema";

/** Ordina una coppia di userId sempre allo stesso modo, per far corrispondere la convenzione
 * (userIdLow, userIdHigh) usata da friendships/directMessages indipendentemente da chi dei due
 * agisce per primo. */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function requireFriendship(userIdA: string, userIdB: string) {
  const [userIdLow, userIdHigh] = canonicalPair(userIdA, userIdB);
  const [friendship] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.userIdLow, userIdLow), eq(friendships.userIdHigh, userIdHigh)));
  if (!friendship) throw new Error("Non siete amici.");
  return friendship;
}
