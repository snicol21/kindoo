import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ─── Auth.js Required Tables ──────────────────────────────────────────────────

export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash'),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
  licenseLeadDays: integer('license_lead_days').notNull().default(2),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── Events Table ─────────────────────────────────────────────────────────────

export type Building = 'Stake Center' | 'Maples Building';
export type Ward =
  | '1st Ward'
  | '2nd Ward'
  | '3rd Ward'
  | '4th Ward'
  | '5th Ward'
  | '6th Ward'
  | 'Park Ridge Ward';

export const BUILDINGS: Building[] = ['Stake Center', 'Maples Building'];
export const WARDS: Ward[] = [
  '1st Ward',
  '2nd Ward',
  '3rd Ward',
  '4th Ward',
  '5th Ward',
  '6th Ward',
  'Park Ridge Ward',
];

export const events = sqliteTable('event', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  building: text('building', {
    enum: ['Stake Center', 'Maples Building'],
  })
    .notNull()
    .$type<Building>(),
  ward: text('ward', {
    enum: [
      '1st Ward',
      '2nd Ward',
      '3rd Ward',
      '4th Ward',
      '5th Ward',
      '6th Ward',
      'Park Ridge Ward',
    ],
  })
    .notNull()
    .$type<Ward>(),
  name: text('name').notNull(),
  eventDate: text('event_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  phone: text('phone'),
  email: text('email').notNull(),
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

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;

export type MessageTemplateDefault = typeof messageTemplateDefaults.$inferSelect;
export type NewMessageTemplateDefault = typeof messageTemplateDefaults.$inferInsert;
