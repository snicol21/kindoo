import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import type { AccessContext } from '@/lib/events-service';
import { users, type UserRole, type Ward } from '@/schema/schema';
import { timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

function apiTokensEqual(provided: string, configured: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const API_ACTOR_EMAIL = 'facilities-api@kindoo.internal';
const API_ACTOR_NAME = 'Facilities Lead API';

/**
 * Facilities Lead HTTP API auth.
 * Header: Authorization: Bearer <KINDOO_API_TOKEN>
 * Do NOT use KINDOO_WORKER_TOKEN / X-Worker-Token.
 */
export function getConfiguredApiToken(): string | null {
  const token = process.env.KINDOO_API_TOKEN?.trim();
  return token || null;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

async function ensureApiActorUser(): Promise<AccessContext> {
  const [existing] = await db
    .select({ id: users.id, role: users.role, ward: users.ward })
    .from(users)
    .where(eq(users.email, API_ACTOR_EMAIL))
    .limit(1);

  if (existing) {
    if (existing.role !== 'admin') {
      await db.update(users).set({ role: 'admin' }).where(eq(users.id, existing.id));
    }
    return {
      userId: existing.id,
      role: 'admin',
      ward: existing.ward,
    };
  }

  const [created] = await db
    .insert(users)
    .values({
      email: API_ACTOR_EMAIL,
      name: API_ACTOR_NAME,
      role: 'admin',
      ward: '1st Ward' as Ward,
      phone: '0000000000',
      mustChangePassword: false,
    })
    .returning({ id: users.id, ward: users.ward });

  if (!created) {
    throw new Error('Failed to provision Facilities Lead API actor user.');
  }

  return {
    userId: created.id,
    role: 'admin',
    ward: created.ward,
  };
}

async function resolveSessionAccess(): Promise<AccessContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [dbUser] = await db
    .select({ id: users.id, role: users.role, ward: users.ward, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser) return null;

  return {
    userId: dbUser.id,
    role: isAdminEmail(dbUser.email) ? 'admin' : ((dbUser.role ?? 'ward_user') as UserRole),
    ward: dbUser.ward,
  };
}

export type ApiAuthResult =
  | { ok: true; access: AccessContext; via: 'api_token' | 'session' }
  | { ok: false; response: NextResponse };

/**
 * Prefer KINDOO_API_TOKEN (Bearer). Falls back to signed-in session for humans.
 * Valid API token always yields admin role permissions.
 */
export async function resolveBookingsApiAccess(request: Request): Promise<ApiAuthResult> {
  const configured = getConfiguredApiToken();
  const provided = extractBearerToken(request);

  if (provided) {
    if (!configured) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'KINDOO_API_TOKEN is not configured on the server.' },
          { status: 500 }
        ),
      };
    }
    if (!apiTokensEqual(provided, configured)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }),
      };
    }

    try {
      const access = await ensureApiActorUser();
      return { ok: true, access, via: 'api_token' };
    } catch (error) {
      console.error('[api-auth] Failed to resolve API actor:', error);
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Failed to resolve API actor user.' },
          { status: 500 }
        ),
      };
    }
  }

  const sessionAccess = await resolveSessionAccess();
  if (sessionAccess) {
    return { ok: true, access: sessionAccess, via: 'session' };
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        error:
          'Unauthorized. Provide Authorization: Bearer <KINDOO_API_TOKEN> or sign in with a session.',
      },
      { status: 401 }
    ),
  };
}
