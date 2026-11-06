import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const EVENT_CATEGORIES = [
  "music",
  "comedy",
  "theatre",
  "sports",
  "food",
  "workshops",
  "nightlife",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_STATUSES = ["announced", "on_sale", "sold_out", "past"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const POSTER_INKS = ["stamp", "marigold", "ink", "admit"] as const;
export type PosterInk = (typeof POSTER_INKS)[number];

export const HOST_KINDS = ["promoter", "venue", "collective", "company", "studio", "club"] as const;
export type HostKind = (typeof HOST_KINDS)[number];

export const VENUE_KINDS = [
  "arena",
  "outdoor",
  "auditorium",
  "theatre",
  "club",
  "studio",
  "arts_space",
  "brewpub",
  "meeting_point",
  "trail",
] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const CREDENTIALS = ["orb", "document", "selfie", "device"] as const;
export type Credential = (typeof CREDENTIALS)[number];

export const VERIFICATION_PURPOSES = ["buy", "join", "claim", "login"] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

const createdAt = () =>
  integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`);

export const cities = sqliteTable("cities", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull().default("India"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
});

export const venues = sqliteTable(
  "venues",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    area: text("area").notNull(),
    citySlug: text("city_slug")
      .notNull()
      .references(() => cities.slug),
    capacity: integer("capacity").notNull(),
    kind: text("kind", { enum: VENUE_KINDS }).notNull(),
    address: text("address").notNull(),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
  },
  (t) => [uniqueIndex("venues_slug_unique").on(t.slug), index("venues_city_idx").on(t.citySlug)],
);

export const hosts = sqliteTable(
  "hosts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: HOST_KINDS }).notNull(),
    about: text("about").notNull(),
    payoutAddress: text("payout_address"),
  },
  (t) => [uniqueIndex("hosts_slug_unique").on(t.slug)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    chainEventId: integer("chain_event_id"),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull(),
    category: text("category", { enum: EVENT_CATEGORIES }).notNull(),
    citySlug: text("city_slug")
      .notNull()
      .references(() => cities.slug),
    venueId: text("venue_id")
      .notNull()
      .references(() => venues.id),
    hostId: text("host_id")
      .notNull()
      .references(() => hosts.id),
    startsAt: integer("starts_at").notNull(),
    doorsAt: integer("doors_at").notNull(),
    endsAt: integer("ends_at").notNull(),
    priceUsd: integer("price_usd").notNull(),
    faceValueUnits: text("face_value_units").notNull(),
    seated: integer("seated", { mode: "boolean" }).notNull().default(false),
    capacity: integer("capacity").notNull(),
    sold: integer("sold").notNull().default(0),
    status: text("status", { enum: EVENT_STATUSES }).notNull(),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    ageLimit: integer("age_limit").notNull().default(0),
    language: text("language").notNull(),
    durationMins: integer("duration_mins").notNull(),
    description: text("description").notNull(),
    lineup: text("lineup", { mode: "json" }).$type<string[]>().notNull(),
    highlights: text("highlights", { mode: "json" }).$type<string[]>().notNull(),
    posterVariant: integer("poster_variant").notNull(),
    posterInk: text("poster_ink", { enum: POSTER_INKS }).notNull(),
    surrenderCutoffHours: integer("surrender_cutoff_hours").notNull(),
    officialUrl: text("official_url").notNull().default(""),
    sourceUrl: text("source_url").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("events_chain_event_id_unique").on(t.chainEventId),
    index("events_city_starts_idx").on(t.citySlug, t.startsAt),
    index("events_venue_idx").on(t.venueId),
    index("events_host_idx").on(t.hostId),
  ],
);

export const humans = sqliteTable("humans", {
  nullifier: text("nullifier").primaryKey(),
  credential: text("credential", { enum: CREDENTIALS }).notNull(),
  firstVerifiedAt: integer("first_verified_at").notNull(),
});

export const verifications = sqliteTable(
  "verifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nullifier: text("nullifier")
      .notNull()
      .references(() => humans.nullifier),
    action: text("action").notNull(),
    eventId: text("event_id"),
    wallet: text("wallet"),
    purpose: text("purpose", { enum: VERIFICATION_PURPOSES }).notNull(),
    environment: text("environment").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("verifications_action_nullifier_purpose_unique").on(t.action, t.nullifier, t.purpose),
    index("verifications_event_idx").on(t.eventId),
  ],
);

export const attendance = sqliteTable(
  "attendance",
  {
    eventId: text("event_id").notNull(),
    nullifier: text("nullifier").notNull(),
    admittedAt: integer("admitted_at").notNull(),
  },
  (t) => [primaryKey({ name: "attendance_event_nullifier_pk", columns: [t.eventId, t.nullifier] })],
);

export const ACCOUNT_KINDS = ["fan", "host"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const WALLET_KINDS = ["device", "external"] as const;
export type WalletKind = (typeof WALLET_KINDS)[number];

/** Signed-in person. Identity is a World ID nullifier, not an email or password. */
export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ACCOUNT_KINDS }).notNull(),
    nullifier: text("nullifier").notNull(),
    credential: text("credential", { enum: CREDENTIALS }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("accounts_kind_nullifier_unique").on(t.kind, t.nullifier),
    index("accounts_nullifier_idx").on(t.nullifier),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_account_idx").on(t.accountId), index("sessions_expires_idx").on(t.expiresAt)],
);

/** Wallets linked to an account. One may be active for paying. */
export const wallets = sqliteTable(
  "wallets",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    kind: text("kind", { enum: WALLET_KINDS }).notNull(),
    label: text("label"),
    active: integer("active", { mode: "boolean" }).notNull().default(false),
    linkedAt: integer("linked_at").notNull(),
  },
  (t) => [
    uniqueIndex("wallets_account_address_unique").on(t.accountId, t.address),
    index("wallets_account_idx").on(t.accountId),
  ],
);

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
export type Host = typeof hosts.$inferSelect;
export type NewHost = typeof hosts.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Human = typeof humans.$inferSelect;
export type NewHuman = typeof humans.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type WalletRow = typeof wallets.$inferSelect;
