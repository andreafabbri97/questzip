import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { campaignChatMessages, campaignMembers, campaigns, users } from "../lib/db/schema";

// Helper DB per gli spec E2E che devono verificare cose raggiungibili solo con dati VERI sul
// server (chat di campagna, che vive in Postgres, non in localStorage come i personaggi — vedi
// injectTestCharacter in helpers.ts). Stessa connessione dell'app, stesso account di test
// (e2e-test@questzip.local, quello dietro playwright/.auth/user.json). Ogni spec che la usa deve
// ripulire da sé quello che crea (vedi cleanupSeededCampaign), per non lasciare dati residui.
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function getTestUserId(): Promise<string> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, "e2e-test@questzip.local"));
  if (!user) throw new Error("Utente di test e2e-test@questzip.local non trovato — esegui prima npm run test:e2e:login.");
  return user.id;
}

/** Crea una campagna con l'utente di test come DM e N messaggi di riempimento — usata per
 * verificare lo scroll interno della chat, che serve davvero solo con contenuto che straborda. */
export async function seedCampaignWithMessages(
  nome: string,
  messageCount: number,
): Promise<string> {
  const userId = await getTestUserId();
  const [campaign] = await db.insert(campaigns).values({ nome, ownerId: userId }).returning();
  await db.insert(campaignMembers).values({ campaignId: campaign.id, userId, role: "dm" });
  for (let i = 1; i <= messageCount; i++) {
    await db.insert(campaignChatMessages).values({
      campaignId: campaign.id,
      authorId: userId,
      testo: `Messaggio di riempimento numero ${i}`,
    });
  }
  return campaign.id;
}

/** Elimina la campagna di test (cascata su membri e messaggi, vedi i vincoli in lib/db/schema.ts). */
export async function cleanupSeededCampaign(campaignId: string): Promise<void> {
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
}
