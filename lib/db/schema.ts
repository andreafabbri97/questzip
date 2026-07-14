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
