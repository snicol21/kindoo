import * as schema from '@/schema/schema';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

function createDbClient() {
  const url = process.env.TURSO_DATABASE_URL;

  if (!url) {
    throw new Error(
      'TURSO_DATABASE_URL is not set.\n' +
        "  • Local dev: Run 'devbox shell' to auto-generate .env.local\n" +
        '  • Production: Set TURSO_DATABASE_URL in your Vercel environment variables'
    );
  }

  const isLocalFile = url.startsWith('file:');
  const authToken = process.env.TURSO_AUTH_TOKEN;

  const client = createClient({
    url,
    // No auth token needed for local file-based SQLite
    ...(authToken && !isLocalFile ? { authToken } : {}),
  });

  return drizzle(client, {
    schema,
    logger: process.env.NODE_ENV === 'development',
  });
}

// Singleton — safe for Next.js HMR
const globalForDb = global as unknown as {
  db: ReturnType<typeof createDbClient>;
};

export const db = globalForDb.db ?? createDbClient();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.db = db;
}
