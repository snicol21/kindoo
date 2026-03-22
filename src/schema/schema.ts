import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const WARD_BUILDING: Record<Ward, Building> = {
  '1st Ward': 'Maples Building',
  '2nd Ward': 'Maples Building',
  '3rd Ward': 'Stake Center',
  '4th Ward': 'Stake Center',
  '5th Ward': 'Maples Building',
  '6th Ward': 'Stake Center',
  'Park Ridge Ward': 'Maples Building',
};

export const USER_ROLES = ['admin', 'stake_manager', 'ward_manager', 'ward_user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCESS_REQUEST_STATUSES = ['pending', 'approved', 'denied'] as const;
export type AccessRequestStatus = (typeof ACCESS_REQUEST_STATUSES)[number];

export const EVENT_TYPES = ['Private', 'Ward', 'Stake', 'Special'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// ─── Auth.js Required Tables ──────────────────────────────────────────────────

export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash'),
  mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull().default(false),
  role: text('role', { enum: USER_ROLES }).notNull().$type<UserRole>().default('ward_user'),
  ward: text('ward', { enum: WARDS }).notNull().$type<Ward>().default('1st Ward'),
  phone: text('phone').notNull().default('0000000000'),
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

export const accessRequests = sqliteTable(
  'access_request',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    ward: text('ward', { enum: WARDS }).notNull().$type<Ward>(),
    comments: text('comments'),
    requestedRole: text('requested_role', { enum: USER_ROLES }).$type<UserRole>(),
    status: text('status', { enum: ACCESS_REQUEST_STATUSES })
      .notNull()
      .$type<AccessRequestStatus>()
      .default('pending'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewNote: text('review_note'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    statusCreatedIdx: index('access_request_status_created_idx').on(table.status, table.createdAt),
    emailStatusIdx: index('access_request_email_status_idx').on(table.email, table.status),
  })
);

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
  eventType: text('event_type', { enum: EVENT_TYPES })
    .notNull()
    .$type<EventType>()
    .default('Private'),
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

export const NOTIFICATION_EVENT_KEYS = [
  'access_request_submitted',
  'license_job_completed',
  'license_job_failed',
  'event_created',
] as const;
export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number];

export const NOTIFICATION_OUTBOX_STATUSES = ['pending', 'sent', 'failed'] as const;
export type NotificationOutboxStatus = (typeof NOTIFICATION_OUTBOX_STATUSES)[number];

export const notificationPreferences = sqliteTable('notification_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  smsEnabled: integer('sms_enabled', { mode: 'boolean' }).notNull().default(false),
  smsPhone: text('sms_phone'),
  accessRequestSubmittedSms: integer('access_request_submitted_sms', { mode: 'boolean' })
    .notNull()
    .default(true),
  licenseJobCompletedSms: integer('license_job_completed_sms', { mode: 'boolean' })
    .notNull()
    .default(true),
  licenseJobFailedSms: integer('license_job_failed_sms', { mode: 'boolean' })
    .notNull()
    .default(true),
  eventCreatedSms: integer('event_created_sms', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const smsRoleAccessConfig = sqliteTable('sms_role_access_config', {
  id: text('id').primaryKey(),
  adminEnabled: integer('admin_enabled', { mode: 'boolean' }).notNull().default(true),
  stakeManagerEnabled: integer('stake_manager_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  wardManagerEnabled: integer('ward_manager_enabled', { mode: 'boolean' }).notNull().default(false),
  wardUserEnabled: integer('ward_user_enabled', { mode: 'boolean' }).notNull().default(false),
  updatedByUserId: text('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const notificationOutbox = sqliteTable(
  'notification_outbox',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventKey: text('event_key', { enum: NOTIFICATION_EVENT_KEYS })
      .notNull()
      .$type<NotificationEventKey>(),
    recipientUserId: text('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    message: text('message').notNull(),
    status: text('status', { enum: NOTIFICATION_OUTBOX_STATUSES })
      .notNull()
      .$type<NotificationOutboxStatus>()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    providerMessageId: text('provider_message_id'),
    providerError: text('provider_error'),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    recipientStatusIdx: index('notification_outbox_recipient_status_idx').on(
      table.recipientUserId,
      table.status,
      table.createdAt
    ),
    eventStatusIdx: index('notification_outbox_event_status_idx').on(table.eventKey, table.status),
  })
);

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
    runLog: text('run_log'),
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

export type AccessRequest = typeof accessRequests.$inferSelect;
export type NewAccessRequest = typeof accessRequests.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;

export type MessageTemplateDefault = typeof messageTemplateDefaults.$inferSelect;
export type NewMessageTemplateDefault = typeof messageTemplateDefaults.$inferInsert;

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

export type SmsRoleAccessConfig = typeof smsRoleAccessConfig.$inferSelect;
export type NewSmsRoleAccessConfig = typeof smsRoleAccessConfig.$inferInsert;

export type NotificationOutboxEntry = typeof notificationOutbox.$inferSelect;
export type NewNotificationOutboxEntry = typeof notificationOutbox.$inferInsert;

export type KindooLicenseJob = typeof kindooLicenseJobs.$inferSelect;
export type NewKindooLicenseJob = typeof kindooLicenseJobs.$inferInsert;

export type LicenseWorkerHeartbeat = typeof licenseWorkerHeartbeats.$inferSelect;
export type NewLicenseWorkerHeartbeat = typeof licenseWorkerHeartbeats.$inferInsert;
