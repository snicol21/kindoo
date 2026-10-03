'use server';

import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createEventForAccess,
  deleteEventForAccess,
  deleteEventsForAccess,
  importEventsForAccess,
  listEventsForAccess,
  setKindooLicenseCreatedForAccess,
  updateEventForAccess,
  type AccessContext,
  type ActionResult,
  type AddEventInput,
  type EventWithCreator,
  type ImportEventsResult,
  type UpdateEventInput,
} from '@/lib/events-service';
import { users, type Building, type Event, type UserRole } from '@/schema/schema';
import { eq } from 'drizzle-orm';

export type {
  AccessContext,
  ActionResult,
  AddEventInput,
  EventWithCreator,
  ImportEventsResult,
  UpdateEventInput,
};

async function resolveAccessContext(): Promise<ActionResult<AccessContext>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: 'Not authenticated.' };
  }

  const [dbUser] = await db
    .select({ id: users.id, role: users.role, ward: users.ward, email: users.email })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!dbUser) {
    return { success: false, error: 'Not authenticated.' };
  }

  return {
    success: true,
    data: {
      userId: dbUser.id,
      role: isAdminEmail(dbUser.email) ? 'admin' : ((dbUser.role ?? 'ward_user') as UserRole),
      ward: dbUser.ward,
    },
  };
}

export async function addEvent(input: AddEventInput): Promise<ActionResult<Event>> {
  const access = await resolveAccessContext();
  if (!access.success || !access.data) return { success: false, error: access.error };
  return createEventForAccess(access.data, input);
}

export async function getEventsByBuilding(
  building: Building
): Promise<ActionResult<EventWithCreator[]>> {
  const access = await resolveAccessContext();
  if (!access.success || !access.data) {
    return { success: false, error: access.error ?? 'Not authenticated.', data: [] };
  }
  return listEventsForAccess(access.data, { building });
}

export async function deleteEvent(eventId: string): Promise<ActionResult<void>> {
  const access = await resolveAccessContext();
  if (!access.success || !access.data) return { success: false, error: access.error };
  return deleteEventForAccess(access.data, eventId);
}

export async function deleteEvents(eventIds: string[]): Promise<ActionResult<{ deleted: number }>> {
  const access = await resolveAccessContext();
  if (!access.success || !access.data) return { success: false, error: access.error };
  return deleteEventsForAccess(access.data, eventIds);
}

export async function updateEvent(input: UpdateEventInput): Promise<ActionResult<Event>> {
  const access = await resolveAccessContext();
  if (!access.success || !access.data) return { success: false, error: access.error };
  return updateEventForAccess(access.data, input);
}

export async function importEvents(input: {
  events: AddEventInput[];
}): Promise<ActionResult<ImportEventsResult>> {
  const access = await resolveAccessContext();
  if (!access.success || !access.data) return { success: false, error: access.error };
  return importEventsForAccess(access.data, input);
}

export async function setKindooLicenseCreated(input: {
  eventId: string;
  kindooLicenseCreated: boolean;
}): Promise<ActionResult<Event>> {
  const access = await resolveAccessContext();
  if (!access.success || !access.data) return { success: false, error: access.error };
  return setKindooLicenseCreatedForAccess(access.data, input);
}
