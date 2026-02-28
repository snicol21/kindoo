import type { Config } from 'drizzle-kit';

// drizzle-kit automatically loads .env and .env.local
// No need to manually import dotenv here
const url = process.env.TURSO_DATABASE_URL ?? 'file:./local.db';
const isLocal = url.startsWith('file:');

export default {
  schema: './src/schema/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url,
    ...(isLocal ? {} : { authToken: process.env.TURSO_AUTH_TOKEN }),
  },
  verbose: true,
} satisfies Config;
