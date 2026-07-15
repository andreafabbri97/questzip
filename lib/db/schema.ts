import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  uuid,
  pgEnum,
  jsonb,
  unique,
  boolean,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Ability, ClassEntry } from "@/lib/dnd";
import type { CellType, DungeonRoom } from "@/lib/dungeon";

// --- Tabelle richieste dall'adapter Drizzle di Auth.js ---

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({ columns: [verificationToken.identifier, verificationToken.token] }),
  ],
);

// --- Tabelle QuestZip: campagne condivise, membri, inviti ---

export const campaignRoleEnum = pgEnum("campaign_role", ["dm", "player"]);

export const campaigns = pgTable("campaign", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  descrizione: text("descrizione").notNull().default(""),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const campaignMembers = pgTable(
  "campaign_member",
  {
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: campaignRoleEnum("role").notNull().default("player"),
    joinedAt: timestamp("joined_at", { mode: "date" }).notNull().defaultNow(),
  },
  (member) => [primaryKey({ columns: [member.campaignId, member.userId] })],
);

export const campaignInvites = pgTable("campaign_invite", {
  code: text("code")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "date" }),
});

// Dungeon generato proceduralmente: griglia + stanze salvate come jsonb (piccolo, letto/scritto
// per intero — niente bisogno di normalizzare). Pensato per poter diventare in futuro lo sfondo
// della lavagna condivisa: coordinate a griglia riusabili per posizionare i token sopra.
export const campaignDungeons = pgTable("campaign_dungeon", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  cells: jsonb("cells").$type<CellType[][]>().notNull(),
  rooms: jsonb("rooms").$type<DungeonRoom[]>().notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Posizione (in celle di griglia) del segnalino di ogni giocatore sulla lavagna condivisa
// di un dungeon. Un solo token per utente per dungeon (PK composita). Aggiornata dalla
// server action upsertMyToken al rilascio del trascinamento; il movimento durante il
// trascinamento è invece solo un relay realtime (vedi party/campaign-room.ts), non tocca
// il database a ogni frame.
export const dungeonTokens = pgTable(
  "dungeon_token",
  {
    dungeonId: uuid("dungeon_id")
      .notNull()
      .references(() => campaignDungeons.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.dungeonId, table.userId] })],
);

export const campaignSessionNotes = pgTable("campaign_session_note", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  titolo: text("titolo").notNull(),
  testo: text("testo").notNull().default(""),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Snapshot del personaggio (di Personaggi, salvato in locale) portato in una campagna:
// il giocatore lo aggiorna quando vuole con "Aggiorna nella campagna", non è sync live.
export const campaignCharacters = pgTable(
  "campaign_character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    razza: text("razza").notNull().default(""),
    classi: jsonb("classi").$type<ClassEntry[]>().notNull(),
    hpMax: integer("hp_max").notNull(),
    hpAttuali: integer("hp_attuali").notNull(),
    classeArmatura: integer("classe_armatura").notNull(),
    velocita: integer("velocita").notNull(),
    caratteristiche: jsonb("caratteristiche").$type<Record<Ability, number>>().notNull(),
    note: text("note").notNull().default(""),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.campaignId, table.userId)],
);

// Un solo combattimento attivo per campagna alla volta (campaignId unique): il master lo avvia,
// aggiunge combattenti (party + mostri, anche presi dal Compendio), avanza i turni.
export const campaignEncounters = pgTable("campaign_encounter", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .unique()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  round: integer("round").notNull().default(1),
  currentTurn: integer("current_turn").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const encounterCombatants = pgTable("encounter_combatant", {
  id: uuid("id").primaryKey().defaultRandom(),
  encounterId: uuid("encounter_id")
    .notNull()
    .references(() => campaignEncounters.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  iniziativa: integer("iniziativa").notNull().default(0),
  hpMax: integer("hp_max").notNull(),
  hpAttuali: integer("hp_attuali").notNull(),
  isPg: boolean("is_pg").notNull().default(false),
  condizioni: jsonb("condizioni").$type<string[]>().notNull().default([]),
  tiriMorteSuccessi: integer("tiri_morte_successi").notNull().default(0),
  tiriMorteFallimenti: integer("tiri_morte_fallimenti").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const campaignEncountersRelations = relations(campaignEncounters, ({ many, one }) => ({
  combatants: many(encounterCombatants),
  campaign: one(campaigns, {
    fields: [campaignEncounters.campaignId],
    references: [campaigns.id],
  }),
}));

export const encounterCombatantsRelations = relations(encounterCombatants, ({ one }) => ({
  encounter: one(campaignEncounters, {
    fields: [encounterCombatants.encounterId],
    references: [campaignEncounters.id],
  }),
}));

export const campaignsRelations = relations(campaigns, ({ many, one }) => ({
  members: many(campaignMembers),
  sessionNotes: many(campaignSessionNotes),
  characters: many(campaignCharacters),
  encounter: many(campaignEncounters),
  owner: one(users, { fields: [campaigns.ownerId], references: [users.id] }),
}));

export const campaignMembersRelations = relations(campaignMembers, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignMembers.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, { fields: [campaignMembers.userId], references: [users.id] }),
}));

// --- Compendio in italiano, estratto dai manuali ufficiali (vedi scripts/ita-compendio/) ---
// Contenuto proprietario: mai esposto senza login (l'intero sito lo richiede, vedi proxy.ts).

export const compendioItaIncantesimi = pgTable("compendio_ita_incantesimo", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  livello: integer("livello").notNull(),
  scuola: text("scuola").notNull(),
  rituale: boolean("rituale").notNull().default(false),
  tempoDiLancio: text("tempo_di_lancio").notNull(),
  gittata: text("gittata").notNull(),
  componenti: text("componenti").notNull(),
  durata: text("durata").notNull(),
  descrizione: text("descrizione").notNull(),
  fonte: text("fonte").notNull(),
});

export const compendioItaMostri = pgTable("compendio_ita_mostro", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  tipo: text("tipo"),
  taglia: text("taglia"),
  allineamento: text("allineamento"),
  classeArmatura: text("classe_armatura"),
  puntiFerita: text("punti_ferita"),
  velocita: text("velocita"),
  caratteristiche: jsonb("caratteristiche").$type<
    Record<string, { score: number; mod: string } | null>
  >(),
  tiriSalvezza: text("tiri_salvezza"),
  abilita: text("abilita"),
  vulnerabilitaDanni: text("vulnerabilita_danni"),
  resistenzaDanni: text("resistenza_danni"),
  immunitaDanni: text("immunita_danni"),
  immunitaCondizioni: text("immunita_condizioni"),
  sensi: text("sensi"),
  linguaggi: text("linguaggi"),
  sfida: text("sfida"),
  pe: text("pe"),
  tratti: text("tratti").notNull().default(""),
  azioni: text("azioni").notNull().default(""),
  azioniLeggendarie: text("azioni_leggendarie").notNull().default(""),
  reazioni: text("reazioni").notNull().default(""),
  numericSuspect: boolean("numeric_suspect").notNull().default(false),
  fonte: text("fonte").notNull(),
});

interface RazzaTratto {
  nome: string;
  testo: string;
}

export const compendioItaRazze = pgTable("compendio_ita_razza", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  introduzione: text("introduzione").notNull().default(""),
  tratti: jsonb("tratti").$type<RazzaTratto[]>().notNull(),
  sottorazze: jsonb("sottorazze")
    .$type<{ nome: string; tratti: RazzaTratto[] }[]>()
    .notNull(),
  fonte: text("fonte").notNull(),
});

interface ClasseLivello {
  bonusCompetenza: string;
  privilegi: string[];
}

export const compendioItaClassi = pgTable("compendio_ita_classe", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: text("nome").notNull(),
  dadoVita: text("dado_vita"),
  puntiFerita1Livello: text("punti_ferita_1_livello"),
  puntiFeritaSuccessivi: text("punti_ferita_successivi"),
  armature: text("armature"),
  armi: text("armi"),
  strumenti: text("strumenti"),
  tiriSalvezza: text("tiri_salvezza"),
  abilita: text("abilita"),
  equipaggiamento: text("equipaggiamento"),
  tabellaLivelli: jsonb("tabella_livelli").$type<Record<string, ClasseLivello>>().notNull(),
  fonte: text("fonte").notNull(),
});

// Regole generali/lore (non incantesimi/mostri/razze/classi): "Regole principali" e "Guida
// agli Avventurieri della Costa della Spada", entrambi PDF scansionati senza text layer,
// estratti via OCR (scripts/ita-compendio/ocr_extract_pdf.py) — qualità nettamente inferiore
// al resto del compendio (vero testo dai PDF, non riconosciuto da un'immagine). Una sezione
// per pagina, mostrata in app con un badge esplicito che avvisa della qualità OCR.
export const compendioItaRegole = pgTable("compendio_ita_regola", {
  id: uuid("id").primaryKey().defaultRandom(),
  titolo: text("titolo").notNull(),
  testo: text("testo").notNull(),
  pagina: integer("pagina"),
  fonte: text("fonte").notNull(),
});
