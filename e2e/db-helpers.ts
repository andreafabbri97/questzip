import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { campaignChatMessages, campaignCharacters, campaignMembers, campaigns, users } from "../lib/db/schema";

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

/**
 * Campagna con dentro il personaggio di UN ALTRO giocatore, per verificare la scheda condivisa
 * che il master apre dal party: con l'utente di test come proprietario del personaggio il
 * pulsante sarebbe "La mia scheda", che è tutt'altra cosa (apre la scheda vera, modificabile).
 * Restituisce anche l'id dell'utente fittizio creato, da ripulire a fine spec.
 */
export async function seedCampaignWithPartyMember(nome: string): Promise<{
  campaignId: string;
  compagnoUserId: string;
  nomePersonaggio: string;
}> {
  const dmId = await getTestUserId();
  const [campaign] = await db.insert(campaigns).values({ nome, ownerId: dmId }).returning();
  await db.insert(campaignMembers).values({ campaignId: campaign.id, userId: dmId, role: "dm" });

  const email = `e2e-compagno-${campaign.id}@questzip.local`;
  const [compagno] = await db
    .insert(users)
    .values({ email, name: "Compagno E2E" })
    .returning({ id: users.id });
  await db
    .insert(campaignMembers)
    .values({ campaignId: campaign.id, userId: compagno.id, role: "player" });

  const nomePersonaggio = "Elowen Vinterbloom";
  await db.insert(campaignCharacters).values({
    campaignId: campaign.id,
    userId: compagno.id,
    nome: nomePersonaggio,
    razza: "Elfo",
    classi: [{ nome: "Ranger", livello: 5 }],
    hpMax: 44,
    hpAttuali: 31,
    classeArmatura: 16,
    velocita: 9,
    visioneRadius: 18,
    scurovisione: true,
    caratteristiche: {
      forza: 10,
      destrezza: 18,
      costituzione: 14,
      intelligenza: 12,
      saggezza: 16,
      carisma: 8,
    },
    trsCompetenti: ["forza", "destrezza"],
    abilitaCompetenti: ["Percezione", "Sopravvivenza", "Furtività"],
    abilitaEsperte: [],
    armi: [
      {
        id: "e2e-arco",
        nome: "Arco lungo",
        caratteristica: "destrezza",
        competente: true,
        bonusExtra: 0,
        dadoDanno: "1d8",
        tipoDanno: "perforanti",
        aDistanza: true,
      },
    ],
    incantesimi: [
      { id: "e2e-sp1", nome: "Marchio del Cacciatore", livello: 1, preparato: true, dadoDanno: "1d6" },
    ],
    condizioniAttive: ["Avvelenato"],
    ispirazione: 1,
    affaticamento: 1,
    dadiVitaUsati: 2,
    note: "Cerca la sorella scomparsa nel Bosco Ombroso.",
  });

  // Anche il personaggio dell'utente di test entra nel party: serve a far comparire il pulsante
  // "La mia scheda", che è il caso opposto (apre la scheda vera e modificabile, non l'istantanea).
  // Il nome combacia con quello iniettato in localStorage da injectTestCharacter.
  await db.insert(campaignCharacters).values({
    campaignId: campaign.id,
    userId: dmId,
    nome: "Test E2E",
    razza: "Umano",
    classi: [{ nome: "Guerriero", livello: 5 }],
    hpMax: 30,
    hpAttuali: 30,
    classeArmatura: 15,
    velocita: 9,
    caratteristiche: {
      forza: 16,
      destrezza: 12,
      costituzione: 14,
      intelligenza: 10,
      saggezza: 12,
      carisma: 8,
    },
  });

  return { campaignId: campaign.id, compagnoUserId: compagno.id, nomePersonaggio };
}

/** Ripulisce anche l'utente fittizio creato da seedCampaignWithPartyMember. */
export async function cleanupSeededMember(campaignId: string, compagnoUserId: string): Promise<void> {
  await db.delete(campaigns).where(eq(campaigns.id, campaignId));
  await db.delete(users).where(eq(users.id, compagnoUserId));
}
