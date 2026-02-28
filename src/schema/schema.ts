import { sql } from 'drizzle-orm';
import { text, integer, sqliteTable } from 'drizzle-orm/sqlite-core';

// ─── Auth.js Required Tables ──────────────────────────────────────────────────

export const users = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash'),
  resetTokenHash: text('reset_token_hash'),
  resetTokenExpires: integer('reset_token_expires', { mode: 'timestamp_ms' }),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── Events Table ─────────────────────────────────────────────────────────────

export type Building = 'Stake Center' | 'Maples Building';

export const BUILDINGS: Building[] = ['Stake Center', 'Maples Building'];

export const events = sqliteTable('event', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  building: text('building', {
    enum: ['Stake Center', 'Maples Building'],
  })
    .notNull()
    .$type<Building>(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email').notNull(),
  description: text('description').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
