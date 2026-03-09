import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';

export const BUILDINGS = ['Stake Center', 'Maples Building'] as const;
export type Building = (typeof BUILDINGS)[number];
export const DEFAULT_BUILDING: Building = 'Stake Center';

export const WARDS = [
  '1st Ward',
  '2nd Ward',
  '3rd Ward',
  '4th Ward',
  '5th Ward',
  '6th Ward',
  'Park Ridge Ward',
] as const;
export type Ward = (typeof WARDS)[number];

export const USER_ROLES = ['admin', 'manager', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ─── Auth.js Required Tables ──────────────────────────────────────────────────

export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash'),
  role: text('role', { enum: USER_ROLES }).notNull().$type<UserRole>().default('user'),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
  defaultBuilding: text('default_building', {
    enum: BUILDINGS,
  })
    .notNull()
    .$type<Building>()
    .default(DEFAULT_BUILDING),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── Contacts Table ──────────────────────────────────────────────────────────

export const contacts = sqliteTable(
  'contact',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull(),
    ward: text('ward', { enum: WARDS }).notNull().$type<Ward>(),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    contactIdentifierCheck: check(
      'contact_identifier_check',
      sql`(email is null or trim(email) <> '') and (phone is null or trim(phone) <> '') and (email is not null or phone is not null)`
    ),
    nameIdx: index('contact_name_idx').on(table.name),
    wardIdx: index('contact_ward_idx').on(table.ward),
    emailIdx: index('contact_email_idx').on(table.email),
    phoneIdx: index('contact_phone_idx').on(table.phone),
    emailUnique: uniqueIndex('contact_email_unique').on(table.ward, table.email),
    phoneUnique: uniqueIndex('contact_phone_unique').on(table.ward, table.phone),
  })
);

// ─── Events Table ─────────────────────────────────────────────────────────────

export const events = sqliteTable('event', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  building: text('building', {
    enum: BUILDINGS,
  })
    .notNull()
    .$type<Building>(),
  eventDate: text('event_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  contactId: text('contactId')
    .notNull()
    .references(() => contacts.id, { onDelete: 'restrict' }),
  description: text('description').notNull(),
  kindooLicenseCreated: integer('kindoo_license_created', { mode: 'boolean' })
    .notNull()
    .default(false),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── Message Templates ───────────────────────────────────────────────────────

export const messageTemplates = sqliteTable(
  'message_template',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    userKeyUnique: uniqueIndex('message_template_user_key_unique').on(table.userId, table.key),
  })
);

export const messageTemplateDefaults = sqliteTable('message_template_default', {
  key: text('key').primaryKey(),
  body: text('body').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const KINDOO_LICENSE_JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type KindooLicenseJobStatus = (typeof KINDOO_LICENSE_JOB_STATUSES)[number];
export const KINDOO_LICENSE_COMPLETION_TYPES = [
  'temporary-license-created',
  'existing-active-license',
] as const;
export type KindooLicenseCompletionType = (typeof KINDOO_LICENSE_COMPLETION_TYPES)[number];

export const kindooLicenseJobs = sqliteTable(
  'kindoo_license_job',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text('eventId')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    requestedByUserId: text('requestedByUserId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workerId: text('worker_id'),
    status: text('status', { enum: KINDOO_LICENSE_JOB_STATUSES })
      .notNull()
      .$type<KindooLicenseJobStatus>()
      .default('queued'),
    email: text('email').notNull(),
    description: text('description').notNull(),
    timezone: text('timezone').notNull(),
    startDate: text('start_date').notNull(),
    startTime: text('start_time').notNull(),
    endDate: text('end_date').notNull(),
    endTime: text('end_time').notNull(),
    kindooAccessRule: text('kindoo_access_rule'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    completionType: text('completion_type', {
      enum: KINDOO_LICENSE_COMPLETION_TYPES,
    }).$type<KindooLicenseCompletionType>(),
    statusDetails: text('status_details'),
    durationMs: integer('duration_ms'),
    sessionReused: integer('session_reused', { mode: 'boolean' }),
    claimedAt: integer('claimed_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    eventStatusIdx: index('kindoo_license_job_event_status_idx').on(table.eventId, table.status),
    statusCreatedIdx: index('kindoo_license_job_status_created_idx').on(
      table.status,
      table.createdAt
    ),
    requestedByIdx: index('kindoo_license_job_requested_by_idx').on(table.requestedByUserId),
  })
);

export const licenseWorkerHeartbeats = sqliteTable(
  'license_worker_heartbeat',
  {
    workerId: text('worker_id').primaryKey(),
    host: text('host'),
    mode: text('mode'),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    lastSeenIdx: index('license_worker_heartbeat_last_seen_idx').on(table.lastSeenAt),
  })
);

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;

export type MessageTemplateDefault = typeof messageTemplateDefaults.$inferSelect;
export type NewMessageTemplateDefault = typeof messageTemplateDefaults.$inferInsert;

export type KindooLicenseJob = typeof kindooLicenseJobs.$inferSelect;
export type NewKindooLicenseJob = typeof kindooLicenseJobs.$inferInsert;

export type LicenseWorkerHeartbeat = typeof licenseWorkerHeartbeats.$inferSelect;
export type NewLicenseWorkerHeartbeat = typeof licenseWorkerHeartbeats.$inferInsert;
