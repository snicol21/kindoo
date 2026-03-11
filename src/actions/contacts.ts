'use server';

import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { contacts, users, type Contact, type UserRole, type Ward } from '@/schema/schema';
import { normalizePhoneForStorage } from '@/utils/phoneUtils';
import { normalizeEmail } from '@/utils/stringUtils';
import type { SQL } from 'drizzle-orm';
import { and, asc, eq, like, or } from 'drizzle-orm';

export interface ContactSearchResult {
  id: string;
  name: string;
  ward: Ward;
  email: string | null;
  phone: string | null;
}

export interface ContactActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

async function resolveContactAccess() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [dbUser] = await db
    .select({ id: users.id, role: users.role, ward: users.ward, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser) return null;
  const role: UserRole = isAdminEmail(dbUser.email)
    ? 'admin'
    : ((dbUser.role ?? 'ward_user') as UserRole);
  return { userId: dbUser.id, role, ward: dbUser.ward };
}

function scoreNameMatch(contactName: string, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return 0;

  const name = contactName.trim().toLowerCase();
  if (!name) return 0;

  if (name === query) return 5000;
  if (name.startsWith(query)) return 4000;

  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.some((token) => token === query)) return 3200;
  if (tokens.some((token) => token.startsWith(query))) return 2800;

  const includesAt = name.indexOf(query);
  if (includesAt >= 0) {
    // Earlier substring hits are generally stronger than trailing hits.
    return Math.max(1200 - includesAt * 5, 600);
  }

  return 0;
}

export async function updateContact(input: {
  id: string;
  name: string;
  ward: Ward;
  email?: string | null;
  phone?: string | null;
}): Promise<ContactActionResult<Contact>> {
  try {
    const access = await resolveContactAccess();
    if (!access) {
      return { success: false, error: 'Not authenticated.' };
    }

    if (!input.id?.trim()) {
      return { success: false, error: 'Invalid contact id.' };
    }

    const emailValue = input.email?.trim() ? normalizeEmail(input.email) : null;
    const phoneValue = input.phone?.trim() ? normalizePhoneForStorage(input.phone) : null;

    if (!emailValue && !phoneValue) {
      return { success: false, error: 'At least one contact method is required (email or phone).' };
    }

    if (
      (access.role === 'ward_manager' || access.role === 'ward_user') &&
      input.ward !== access.ward
    ) {
      return { success: false, error: 'You can only update contacts in your ward.' };
    }

    const [existing] = await db
      .select({ ward: contacts.ward })
      .from(contacts)
      .where(eq(contacts.id, input.id))
      .limit(1);

    if (!existing) {
      return { success: false, error: 'Contact not found.' };
    }

    if (
      (access.role === 'ward_manager' || access.role === 'ward_user') &&
      existing.ward !== access.ward
    ) {
      return { success: false, error: 'You can only update contacts in your ward.' };
    }

    const [updated] = await db
      .update(contacts)
      .set({
        name: input.name.trim(),
        ward: input.ward,
        email: emailValue,
        phone: phoneValue,
      })
      .where(eq(contacts.id, input.id))
      .returning();

    if (!updated) {
      return { success: false, error: 'Contact not found.' };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('[updateContact] Error:', error);
    return { success: false, error: 'Failed to update contact.' };
  }
}

export async function searchContacts(input: {
  query?: string;
  limit?: number;
  ward?: Ward;
}): Promise<ContactActionResult<ContactSearchResult[]>> {
  try {
    const access = await resolveContactAccess();
    if (!access) {
      return { success: false, error: 'Not authenticated.', data: [] };
    }

    const normalized = (input.query ?? '').trim();
    const limit = Math.max(1, Math.min(input.limit ?? 8, 25));
    const wardFilter =
      access.role === 'ward_manager' || access.role === 'ward_user' ? access.ward : input.ward;

    if (!normalized) {
      return { success: true, data: [] };
    }

    const addWardFilter = (clause: SQL<unknown>): SQL<unknown> =>
      wardFilter ? (and(eq(contacts.ward, wardFilter), clause) ?? clause) : clause;

    const rows: ContactSearchResult[] = [];
    const seen = new Set<string>();

    const takeRows = async (clause: SQL<unknown>) => {
      const remaining = limit - rows.length;
      if (remaining <= 0) return;

      const batch = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          ward: contacts.ward,
          email: contacts.email,
          phone: contacts.phone,
        })
        .from(contacts)
        .where(addWardFilter(clause))
        .orderBy(asc(contacts.name))
        .limit(remaining);

      for (const row of batch) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
        if (rows.length >= limit) break;
      }
    };

    const normalizedEmail = normalizeEmail(normalized) ?? normalized.toLowerCase();
    const normalizedPhone = normalizePhoneForStorage(normalized) ?? normalized;
    const phoneDigits = normalized.replace(/\D/g, '');
    const isEmailSearch = normalized.includes('@');
    // Bias toward name search unless input is clearly a phone number.
    const looksLikePhoneInput = /^[\d\s+().-]+$/.test(normalized);
    const isPhoneSearch = !isEmailSearch && looksLikePhoneInput && phoneDigits.length >= 7;

    if (isEmailSearch) {
      // Fast path: exact/prefix on email can use indexes better than contains.
      await takeRows(eq(contacts.email, normalizedEmail));
      await takeRows(like(contacts.email, `${normalizedEmail}%`));
    } else if (isPhoneSearch) {
      // Stored phones are normalized format, so normalize query before matching.
      await takeRows(eq(contacts.phone, normalizedPhone));
      await takeRows(like(contacts.phone, `${normalizedPhone}%`));
    } else {
      await takeRows(eq(contacts.name, normalized));
      await takeRows(like(contacts.name, `${normalized}%`));
    }

    if (rows.length < limit) {
      const pattern = `%${normalized}%`;
      const broadClause = or(
        like(contacts.name, pattern),
        like(contacts.ward, pattern),
        like(contacts.email, pattern),
        like(contacts.phone, pattern)
      );
      if (broadClause) {
        await takeRows(broadClause);
      }
    }

    if (!isEmailSearch && !isPhoneSearch) {
      rows.sort((a, b) => {
        const scoreA = scoreNameMatch(a.name, normalized);
        const scoreB = scoreNameMatch(b.name, normalized);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.name.localeCompare(b.name);
      });
    }

    return { success: true, data: rows };
  } catch (error) {
    console.error('[searchContacts] Error:', error);
    return { success: false, error: 'Failed to search contacts.', data: [] };
  }
}
