'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { contacts, type Contact, type Ward } from '@/schema/schema';
import { asc, eq, like, or } from 'drizzle-orm';
import { normalizeEmail } from '@/utils/stringUtils';
import { normalizePhoneForStorage } from '@/utils/phoneUtils';

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

export async function updateContact(input: {
  id: string;
  name: string;
  ward: Ward;
  email?: string | null;
  phone?: string | null;
}): Promise<ContactActionResult<Contact>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
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
}): Promise<ContactActionResult<ContactSearchResult[]>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.', data: [] };
    }

    const normalized = (input.query ?? '').trim();
    const limit = Math.max(1, Math.min(input.limit ?? 8, 25));

    if (!normalized) {
      return { success: true, data: [] };
    }

    const pattern = `%${normalized}%`;
    const searchClause = or(
      like(contacts.name, pattern),
      like(contacts.ward, pattern),
      like(contacts.email, pattern),
      like(contacts.phone, pattern)
    );

    const rows = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        ward: contacts.ward,
        email: contacts.email,
        phone: contacts.phone,
      })
      .from(contacts)
      .where(searchClause)
      .orderBy(asc(contacts.name))
      .limit(limit);

    return { success: true, data: rows };
  } catch (error) {
    console.error('[searchContacts] Error:', error);
    return { success: false, error: 'Failed to search contacts.', data: [] };
  }
}
