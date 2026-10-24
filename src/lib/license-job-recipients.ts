import 'server-only';

import { API_ACTOR_EMAIL } from '@/lib/api-actor';
import { db } from '@/lib/db';
import { users } from '@/schema/schema';
import { eq } from 'drizzle-orm';

/**
 * Who gets the "access set up" and "access not set up" texts for a job. Normally only the
 * person who made the booking. Bookings made through the Facilities Lead API belong to a
 * synthetic admin with no real phone, so those go to the admins instead. Each person's own
 * text opt-ins still apply when the text is sent, and each person is listed once.
 */
export async function resolveLicenseJobSmsRecipientIds(
  requestedByUserId: string
): Promise<string[]> {
  try {
    const [creator] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, requestedByUserId))
      .limit(1);

    if (creator?.email?.trim().toLowerCase() !== API_ACTOR_EMAIL) {
      return [requestedByUserId];
    }

    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin'));
    return Array.from(new Set(admins.map((admin) => admin.id))).filter((id) => id !== creator.id);
  } catch (error) {
    console.error('[license-job-recipients] Falling back to the booking creator:', error);
    return [requestedByUserId];
  }
}
