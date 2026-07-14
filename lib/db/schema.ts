import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  primaryKey,
  integer,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

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

export const campaignsRelations = relations(campaigns, ({ many, one }) => ({
  members: many(campaignMembers),
  sessionNotes: many(campaignSessionNotes),
  owner: one(users, { fields: [campaigns.ownerId], references: [users.id] }),
}));

export const campaignMembersRelations = relations(campaignMembers, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignMembers.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, { fields: [campaignMembers.userId], references: [users.id] }),
}));
