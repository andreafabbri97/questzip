import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { campaignMembers } from "@/lib/db/schema";

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Devi accedere per continuare.");
  return session.user.id;
}

async function getMembership(campaignId: string, userId: string) {
  const [member] = await db
    .select()
    .from(campaignMembers)
    .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.userId, userId)));
  return member ?? null;
}

export async function requireDm(campaignId: string, userId: string) {
  const member = await getMembership(campaignId, userId);
  if (!member || member.role !== "dm") throw new Error("Solo il master può farlo.");
  return member;
}

export async function requireMember(campaignId: string, userId: string) {
  const member = await getMembership(campaignId, userId);
  if (!member) throw new Error("Non fai parte di questa campagna.");
  return member;
}
