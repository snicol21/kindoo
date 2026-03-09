'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  contacts,
  events,
  users,
  BUILDINGS,
  WARDS,
  type Building,
  type Event,
  type UserRole,
  type Ward,
} from '@/schema/schema';
import { and, eq, inArray, or } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { isAdminEmail } from '@/lib/admin';
import { normalizePhoneForStorage } from '@/utils/phoneUtils';
import { normalizeEmail } from '@/utils/stringUtils';
import { parseTimeToMinutes } from '@/utils/timeUtils';
import { DESCRIPTION_MAX_LENGTH } from '@/utils/eventConstants';
import { canCreateEventInBuildingForWard, canMutateEvent } from '@/lib/permissions';

const EVENT_TIMEZONE = 'America/Denver';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddEventInput {
  building: Building;
  ward: Ward;
  name: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  phone?: string;
  email?: string;
  description: string;
}

export interface UpdateEventInput extends AddEventInput {
  id: string;
}

export interface EventWithCreator {
  id: string;
  building: Building;
  eventDate: string;
  startTime: string;
  endTime: string;
  contactId: string;
  description: string;
  kindooLicenseCreated: boolean;
  userId: string;
  createdAt: Date;
  creatorName: string | null;
  creatorEmail: string | null;
  contactName: string;
  contactWard: Ward;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface ImportEventsResult {
  inserted: number;
  failed: number;
  rowErrors: { row: number; message: string }[];
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface AccessContext {
  userId: string;
  role: UserRole;
  ward: Ward;
}

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

// ─── Validation Helper ────────────────────────────────────────────────────────

function minutesToTime(minutes: number) {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, Math.floor(minutes)));
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function clampImportTimes(input: AddEventInput): AddEventInput {
  const earliestMinutes = 5 * 60;
  const latestMinutes = 23 * 60;

  const startMinutes = parseTimeToMinutes(input.startTime);
  const endMinutes = parseTimeToMinutes(input.endTime);

  return {
    ...input,
    startTime:
      startMinutes === null
        ? input.startTime
        : minutesToTime(Math.max(startMinutes, earliestMinutes)),
    endTime:
      endMinutes === null ? input.endTime : minutesToTime(Math.min(endMinutes, latestMinutes)),
  };
}

function normalizeEventInput(input: AddEventInput): AddEventInput {
  return {
    ...input,
    name: input.name.trim(),
    eventDate: input.eventDate.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    phone: normalizePhoneForStorage(input.phone),
    email: normalizeEmail(input.email),
    description: input.description.trim(),
  };
}

function getCurrentYmdHmInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') ?? '';
  const month = byType.get('month') ?? '';
  const day = byType.get('day') ?? '';
  const hour = byType.get('hour') ?? '00';
  const minute = byType.get('minute') ?? '00';

  return {
    ymd: `${year}-${month}-${day}`,
    hm: `${hour}:${minute}`,
  };
}

function eventEndsInFuture(eventDate: string, endTime: string, timeZone: string) {
  const now = getCurrentYmdHmInTimeZone(timeZone);
  if (eventDate > now.ymd) return true;
  if (eventDate < now.ymd) return false;
  return endTime >= now.hm;
}

function validateEventInput(input: AddEventInput): string | null {
  if (!input.building || !BUILDINGS.includes(input.building)) {
    return 'Invalid building selection.';
  }
  if (!input.ward || !WARDS.includes(input.ward)) return 'Ward is required.';
  if (!input.name?.trim()) return 'Name is required.';
  if (!/^[^\s]+\s+[^\s]+/.test(input.name.trim())) {
    return 'Please enter both first and last name.';
  }
  if (!input.eventDate?.trim()) return 'Event date is required.';
  if (!input.startTime?.trim()) return 'Start time is required.';
  if (!input.endTime?.trim()) return 'End time is required.';
  const startMinutes = parseTimeToMinutes(input.startTime);
  const endMinutes = parseTimeToMinutes(input.endTime);
  const earliestMinutes = 5 * 60;
  const latestMinutes = 23 * 60;
  if (startMinutes === null) return 'Start time is invalid.';
  if (endMinutes === null) return 'End time is invalid.';
  if (startMinutes < earliestMinutes || startMinutes > latestMinutes) {
    return 'Start time must be between 5:00 AM and 11:00 PM.';
  }
  if (endMinutes > latestMinutes) {
    return 'End time must be no later than 11:00 PM.';
  }
  if (endMinutes <= startMinutes) {
    return 'End time must be after start time.';
  }
  if (!eventEndsInFuture(input.eventDate.trim(), input.endTime.trim(), EVENT_TIMEZONE)) {
    return 'Event must end in the future.';
  }
  if (input.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return 'Email must be valid if provided.';
  }
  if (!input.email?.trim() && !input.phone?.trim()) {
    return 'At least one contact method is required (email or phone).';
  }
  if (!input.description?.trim()) return 'Description is required.';
  if (input.description.trim().length > DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${DESCRIPTION_MAX_LENGTH} characters or less.`;
  }
  if (input.phone && !/^[\d\s\-+().]{7,20}$/.test(input.phone)) {
    return 'Invalid phone number format.';
  }
  return null;
}

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getOrCreateContactId(
  input: {
    ward: Ward;
    name: string;
    email?: string | null;
    phone?: string | null;
  },
  dbLike: DbLike = db
) {
  const emailValue = input.email?.trim() ? normalizeEmail(input.email) : null;
  const phoneValue = input.phone?.trim() ? normalizePhoneForStorage(input.phone) : null;

  if (!emailValue && !phoneValue) {
    throw new Error('At least one contact method is required (email or phone).');
  }

  const identifierPredicate =
    emailValue && phoneValue
      ? or(eq(contacts.email, emailValue), eq(contacts.phone, phoneValue))
      : emailValue
        ? eq(contacts.email, emailValue)
        : eq(contacts.phone, phoneValue!);

  const existing = await dbLike
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.ward, input.ward), identifierPredicate))
    .limit(1);

  if (existing[0]?.id) {
    return existing[0].id;
  }

  let createdId: string | null = null;
  try {
    const [created] = await dbLike
      .insert(contacts)
      .values({
        name: input.name.trim(),
        ward: input.ward,
        email: emailValue,
        phone: phoneValue,
      })
      .returning({ id: contacts.id });

    createdId = created?.id ?? null;
  } catch {
    const [recovered] = await dbLike
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.ward, input.ward), identifierPredicate))
      .limit(1);

    createdId = recovered?.id ?? null;
  }

  return createdId;
}

async function cleanupOrphanContacts(contactIds: string[]) {
  const uniqueContactIds = Array.from(new Set(contactIds.map((id) => id.trim()).filter(Boolean)));
  if (uniqueContactIds.length === 0) return;

  const stillReferenced = await db
    .select({ contactId: events.contactId })
    .from(events)
    .where(inArray(events.contactId, uniqueContactIds));

  const referencedSet = new Set(stillReferenced.map((row) => row.contactId));
  const orphanIds = uniqueContactIds.filter((id) => !referencedSet.has(id));

  if (orphanIds.length > 0) {
    await db.delete(contacts).where(inArray(contacts.id, orphanIds));
  }
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function addEvent(input: AddEventInput): Promise<ActionResult<Event>> {
  try {
    const access = await resolveAccessContext();
    if (!access.success || !access.data) return { success: false, error: access.error };
    const { userId, role, ward } = access.data;

    const normalizedInput = normalizeEventInput(input);
    const validationError = validateEventInput(normalizedInput);
    if (validationError) {
      return { success: false, error: validationError };
    }

    if (!canCreateEventInBuildingForWard(role, ward, normalizedInput.ward, normalizedInput.building)) {
      return {
        success: false,
        error:
          'You can only create events for your assigned ward and its designated building.',
      };
    }

    const newEvent = await db.transaction(async (tx) => {
      const contactId = await getOrCreateContactId(
        {
          ward: normalizedInput.ward,
          name: normalizedInput.name,
          email: normalizedInput.email,
          phone: normalizedInput.phone,
        },
        tx
      );

      if (!contactId) {
        throw new Error('Contact could not be created.');
      }

      const [createdEvent] = await tx
        .insert(events)
        .values({
          building: normalizedInput.building,
          eventDate: normalizedInput.eventDate,
          startTime: normalizedInput.startTime,
          endTime: normalizedInput.endTime,
          contactId,
          description: normalizedInput.description,
          kindooLicenseCreated: false,
          userId,
        })
        .returning();

      if (!createdEvent) {
        throw new Error('Failed to create event.');
      }

      return createdEvent;
    });

    // Invalidate cache tags for this user's events
    revalidateTag(`events-${userId}`, 'max');
    revalidateTag(`events-${userId}-${normalizedInput.building}`, 'max');

    return { success: true, data: newEvent };
  } catch (error) {
    console.error('[addEvent] Error:', error);
    return {
      success: false,
      error: 'Failed to add event. Please try again.',
    };
  }
}

export async function getEventsByBuilding(
  building: Building
): Promise<ActionResult<EventWithCreator[]>> {
  try {
    const access = await resolveAccessContext();
    if (!access.success || !access.data) {
      return { success: false, error: access.error ?? 'Not authenticated.', data: [] };
    }
    const { userId, role, ward } = access.data;

    const userEvents = await db
      .select({
        id: events.id,
        building: events.building,
        eventDate: events.eventDate,
        startTime: events.startTime,
        endTime: events.endTime,
        contactId: events.contactId,
        description: events.description,
        kindooLicenseCreated: events.kindooLicenseCreated,
        userId: events.userId,
        createdAt: events.createdAt,
        creatorName: users.name,
        creatorEmail: users.email,
        contactName: contacts.name,
        contactWard: contacts.ward,
        contactEmail: contacts.email,
        contactPhone: contacts.phone,
      })
      .from(events)
      .innerJoin(users, eq(events.userId, users.id))
      .innerJoin(contacts, eq(events.contactId, contacts.id))
      .where(
        role === 'admin' || role === 'stake_manager'
          ? eq(events.building, building)
          : role === 'ward_manager'
            ? and(eq(events.building, building), eq(contacts.ward, ward))
            : and(eq(events.building, building), eq(events.userId, userId), eq(contacts.ward, ward))
      )
      .orderBy(events.createdAt);

    return { success: true, data: userEvents as EventWithCreator[] };
  } catch (error) {
    console.error('[getEventsByBuilding] Error:', error);
    return { success: false, error: 'Failed to fetch events.', data: [] };
  }
}

export async function deleteEvent(eventId: string): Promise<ActionResult<void>> {
  try {
    const access = await resolveAccessContext();
    if (!access.success || !access.data) return { success: false, error: access.error };
    const { userId, role, ward } = access.data;

    const deletableRows = await db
      .select({ id: events.id, contactId: events.contactId, eventUserId: events.userId, eventWard: contacts.ward })
      .from(events)
      .innerJoin(contacts, eq(events.contactId, contacts.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (deletableRows.length === 0) {
      return { success: false, error: 'Event not found or not authorized.' };
    }

    const row = deletableRows[0];
    if (
      !canMutateEvent({ role, userId, userWard: ward, eventUserId: row.eventUserId, eventWard: row.eventWard })
    ) {
      return { success: false, error: 'Event not found or not authorized.' };
    }

    await db.delete(events).where(eq(events.id, row.id));
    await cleanupOrphanContacts([row.contactId]);

    revalidateTag(`events-${userId}`, 'max');

    return { success: true };
  } catch (error) {
    console.error('[deleteEvent] Error:', error);
    return { success: false, error: 'Failed to delete event.' };
  }
}

export async function deleteEvents(eventIds: string[]): Promise<ActionResult<{ deleted: number }>> {
  try {
    const access = await resolveAccessContext();
    if (!access.success || !access.data) return { success: false, error: access.error };
    const { userId, role, ward } = access.data;

    const ids = eventIds.map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      return { success: false, error: 'No events selected.' };
    }

    const deletableRows = await db
      .select({
        id: events.id,
        contactId: events.contactId,
        eventUserId: events.userId,
        eventWard: contacts.ward,
      })
      .from(events)
      .innerJoin(contacts, eq(events.contactId, contacts.id))
      .where(inArray(events.id, ids));

    const allowedRows = deletableRows.filter((row) =>
      canMutateEvent({ role, userId, userWard: ward, eventUserId: row.eventUserId, eventWard: row.eventWard })
    );

    if (allowedRows.length === 0) {
      return { success: false, error: 'No events found or not authorized.' };
    }

    await db.delete(events).where(
      inArray(
        events.id,
        allowedRows.map((row) => row.id)
      )
    );
    await cleanupOrphanContacts(allowedRows.map((row) => row.contactId));

    revalidateTag(`events-${userId}`, 'max');

    return { success: true, data: { deleted: allowedRows.length } };
  } catch (error) {
    console.error('[deleteEvents] Error:', error);
    return { success: false, error: 'Failed to delete events.' };
  }
}

export async function updateEvent(input: UpdateEventInput): Promise<ActionResult<Event>> {
  try {
    const access = await resolveAccessContext();
    if (!access.success || !access.data) return { success: false, error: access.error };
    const { userId, role, ward } = access.data;

    if (!input.id?.trim()) {
      return { success: false, error: 'Invalid event id.' };
    }

    const [existingEvent] = await db
      .select({ userId: events.userId, contactId: events.contactId, eventWard: contacts.ward })
      .from(events)
      .innerJoin(contacts, eq(events.contactId, contacts.id))
      .where(eq(events.id, input.id))
      .limit(1);

    if (!existingEvent) {
      return { success: false, error: 'Event not found.' };
    }

    if (
      !canMutateEvent({
        role,
        userId,
        userWard: ward,
        eventUserId: existingEvent.userId,
        eventWard: existingEvent.eventWard,
      })
    ) {
      return { success: false, error: 'Event not found.' };
    }

    const normalizedInput = normalizeEventInput(input);
    const validationError = validateEventInput(normalizedInput);
    if (validationError) {
      return { success: false, error: validationError };
    }

    if (!canCreateEventInBuildingForWard(role, ward, normalizedInput.ward, normalizedInput.building)) {
      return {
        success: false,
        error: 'You can only save events for your assigned ward and its designated building.',
      };
    }

    const contactId = await getOrCreateContactId({
      ward: normalizedInput.ward,
      name: normalizedInput.name,
      email: normalizedInput.email,
      phone: normalizedInput.phone,
    });

    const [updatedEvent] = await db
      .update(events)
      .set({
        building: normalizedInput.building,
        eventDate: normalizedInput.eventDate,
        startTime: normalizedInput.startTime,
        endTime: normalizedInput.endTime,
        contactId,
        description: normalizedInput.description,
      })
      .where(eq(events.id, input.id))
      .returning();

    if (!updatedEvent) {
      return { success: false, error: 'Event not found.' };
    }

    if (contactId !== existingEvent.contactId) {
      await cleanupOrphanContacts([existingEvent.contactId]);
    }

    revalidateTag(`events-${userId}`, 'max');
    revalidateTag(`events-${userId}-${normalizedInput.building}`, 'max');

    return { success: true, data: updatedEvent };
  } catch (error) {
    console.error('[updateEvent] Error:', error);
    return { success: false, error: 'Failed to update event.' };
  }
}

export async function importEvents(input: {
  events: AddEventInput[];
}): Promise<ActionResult<ImportEventsResult>> {
  try {
    const access = await resolveAccessContext();
    if (!access.success || !access.data) return { success: false, error: access.error };
    const { userId, role, ward } = access.data;

    const rowErrors: { row: number; message: string }[] = [];
    const validRows: AddEventInput[] = [];

    input.events.forEach((event, index) => {
      const normalizedEvent = clampImportTimes(normalizeEventInput(event));
      const error = validateEventInput(normalizedEvent);
      if (
        !error &&
        !canCreateEventInBuildingForWard(role, ward, normalizedEvent.ward, normalizedEvent.building)
      ) {
        rowErrors.push({
          row: index + 2,
          message: 'You can only import events for your ward and its designated building.',
        });
      } else if (error) {
        rowErrors.push({ row: index + 2, message: error });
      } else {
        validRows.push(normalizedEvent);
      }
    });

    if (validRows.length === 0) {
      return {
        success: false,
        error: 'No valid rows found. Please fix the errors and try again.',
        data: { inserted: 0, failed: rowErrors.length, rowErrors },
      };
    }

    const insertValues = [] as Array<typeof events.$inferInsert>;

    for (const event of validRows) {
      const contactId = await getOrCreateContactId({
        ward: event.ward,
        name: event.name,
        email: event.email,
        phone: event.phone,
      });

      insertValues.push({
        building: event.building,
        eventDate: event.eventDate,
        startTime: event.startTime,
        endTime: event.endTime,
        contactId,
        description: event.description,
        kindooLicenseCreated: false,
        userId,
      });
    }

    await db.insert(events).values(insertValues);

    revalidateTag(`events-${userId}`, 'max');

    return {
      success: true,
      data: {
        inserted: insertValues.length,
        failed: rowErrors.length,
        rowErrors,
      },
    };
  } catch (error) {
    console.error('[importEvents] Error:', error);
    return { success: false, error: 'Failed to import events.' };
  }
}

export async function setKindooLicenseCreated(input: {
  eventId: string;
  kindooLicenseCreated: boolean;
}): Promise<ActionResult<Event>> {
  try {
    const access = await resolveAccessContext();
    if (!access.success || !access.data) return { success: false, error: access.error };
    const { userId, role, ward } = access.data;

    const eventId = input.eventId?.trim();
    if (!eventId) {
      return { success: false, error: 'Invalid event id.' };
    }

    const [existingEvent] = await db
      .select({ id: events.id, eventUserId: events.userId, eventWard: contacts.ward })
      .from(events)
      .innerJoin(contacts, eq(events.contactId, contacts.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (
      !existingEvent ||
      !canMutateEvent({
        role,
        userId,
        userWard: ward,
        eventUserId: existingEvent.eventUserId,
        eventWard: existingEvent.eventWard,
      })
    ) {
      return { success: false, error: 'Event not found.' };
    }

    const [updatedEvent] = await db
      .update(events)
      .set({ kindooLicenseCreated: input.kindooLicenseCreated })
      .where(eq(events.id, eventId))
      .returning();

    if (!updatedEvent) {
      return { success: false, error: 'Event not found.' };
    }

    revalidateTag(`events-${userId}`, 'max');
    revalidateTag(`events-${userId}-${updatedEvent.building}`, 'max');

    return { success: true, data: updatedEvent };
  } catch (error) {
    console.error('[setKindooLicenseCreated] Error:', error);
    return { success: false, error: 'Failed to update Kindoo license status.' };
  }
}
