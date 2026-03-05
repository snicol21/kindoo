// src/actions/events.ts
'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  events,
  users,
  BUILDINGS,
  WARDS,
  type Building,
  type Event,
  type UserRole,
  type Ward,
} from '@/schema/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { isAdminEmail } from '@/lib/admin';

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

export interface EventWithCreator extends Event {
  creatorName: string | null;
  creatorEmail: string | null;
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

function resolveRole(session: { user?: { role?: UserRole; email?: string | null } }): UserRole {
  if (isAdminEmail(session.user?.email ?? null)) return 'admin';
  return (session.user?.role ?? 'user') as UserRole;
}

// ─── Validation Helper ────────────────────────────────────────────────────────

function parseYmd(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function isFutureDate(ymd: string) {
  const parsed = parseYmd(ymd);
  if (!parsed) return false;

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  return targetUtc > todayUtc;
}

function parseTimeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

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

function formatPhoneForStorage(value?: string) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  if (!digits) return undefined;

  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length > 10) {
    normalized = normalized.slice(0, 10);
  }

  if (normalized.length <= 3) return normalized;
  if (normalized.length <= 6) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3)}`;
  }
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function normalizeEventInput(input: AddEventInput): AddEventInput {
  return {
    ...input,
    name: input.name.trim(),
    eventDate: input.eventDate.trim(),
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    phone: formatPhoneForStorage(input.phone),
    email: input.email?.trim().toLowerCase() || undefined,
    description: input.description.trim(),
  };
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
  if (!isFutureDate(input.eventDate.trim())) {
    return 'Event date must be in the future.';
  }
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
  if (input.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return 'Email must be valid if provided.';
  }
  if (!input.description?.trim()) return 'Description is required.';
  if (input.phone && !/^[\d\s\-+().]{7,20}$/.test(input.phone)) {
    return 'Invalid phone number format.';
  }
  return null;
}

// ─── Server Actions ───────────────────────────────────────────────────────────

export async function addEvent(input: AddEventInput): Promise<ActionResult<Event>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const normalizedInput = normalizeEventInput(input);
    const validationError = validateEventInput(normalizedInput);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const [newEvent] = await db
      .insert(events)
      .values({
        building: normalizedInput.building,
        ward: normalizedInput.ward,
        name: normalizedInput.name,
        eventDate: normalizedInput.eventDate,
        startTime: normalizedInput.startTime,
        endTime: normalizedInput.endTime,
        phone: normalizedInput.phone || null,
        email: normalizedInput.email || '',
        description: normalizedInput.description,
        kindooLicenseCreated: false,
        userId: session.user.id,
      })
      .returning();

    // Invalidate cache tags for this user's events
    revalidateTag(`events-${session.user.id}`, 'everything');
    revalidateTag(`events-${session.user.id}-${normalizedInput.building}`, 'everything');

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
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.', data: [] };
    }

    const role = resolveRole(session);

    const userEvents = await db
      .select({
        id: events.id,
        building: events.building,
        ward: events.ward,
        name: events.name,
        eventDate: events.eventDate,
        startTime: events.startTime,
        endTime: events.endTime,
        phone: events.phone,
        email: events.email,
        description: events.description,
        kindooLicenseCreated: events.kindooLicenseCreated,
        userId: events.userId,
        createdAt: events.createdAt,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(events)
      .innerJoin(users, eq(events.userId, users.id))
      .where(
        role === 'user'
          ? and(eq(events.building, building), eq(events.userId, session.user.id))
          : eq(events.building, building)
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
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const role = resolveRole(session);

    const result =
      role === 'user'
        ? await db
            .delete(events)
            .where(and(eq(events.id, eventId), eq(events.userId, session.user.id)))
        : await db.delete(events).where(eq(events.id, eventId));

    if ((result?.rowsAffected ?? 0) === 0) {
      return { success: false, error: 'Event not found or not authorized.' };
    }

    revalidateTag(`events-${session.user.id}`, 'everything');

    return { success: true };
  } catch (error) {
    console.error('[deleteEvent] Error:', error);
    return { success: false, error: 'Failed to delete event.' };
  }
}

export async function deleteEvents(eventIds: string[]): Promise<ActionResult<{ deleted: number }>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const role = resolveRole(session);

    const ids = eventIds.map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      return { success: false, error: 'No events selected.' };
    }

    const result =
      role === 'user'
        ? await db
            .delete(events)
            .where(and(inArray(events.id, ids), eq(events.userId, session.user.id)))
        : await db.delete(events).where(inArray(events.id, ids));

    revalidateTag(`events-${session.user.id}`, 'everything');

    return { success: true, data: { deleted: result.rowsAffected ?? ids.length } };
  } catch (error) {
    console.error('[deleteEvents] Error:', error);
    return { success: false, error: 'Failed to delete events.' };
  }
}

export async function updateEvent(input: UpdateEventInput): Promise<ActionResult<Event>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const role = resolveRole(session);

    if (!input.id?.trim()) {
      return { success: false, error: 'Invalid event id.' };
    }

    const normalizedInput = normalizeEventInput(input);
    const validationError = validateEventInput(normalizedInput);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const [updatedEvent] = await db
      .update(events)
      .set({
        building: normalizedInput.building,
        ward: normalizedInput.ward,
        name: normalizedInput.name,
        eventDate: normalizedInput.eventDate,
        startTime: normalizedInput.startTime,
        endTime: normalizedInput.endTime,
        phone: normalizedInput.phone || null,
        email: normalizedInput.email || '',
        description: normalizedInput.description,
      })
      .where(
        role === 'user'
          ? and(eq(events.id, input.id), eq(events.userId, session.user.id))
          : eq(events.id, input.id)
      )
      .returning();

    if (!updatedEvent) {
      return { success: false, error: 'Event not found.' };
    }

    revalidateTag(`events-${session.user.id}`, 'everything');
    revalidateTag(`events-${session.user.id}-${normalizedInput.building}`, 'everything');

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
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const rowErrors: { row: number; message: string }[] = [];
    const validRows: AddEventInput[] = [];

    input.events.forEach((event, index) => {
      const normalizedEvent = clampImportTimes(normalizeEventInput(event));
      const error = validateEventInput(normalizedEvent);
      if (error) {
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

    const insertValues = validRows.map((event) => ({
      building: event.building,
      ward: event.ward,
      name: event.name,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      phone: event.phone || null,
      email: event.email || '',
      description: event.description,
      kindooLicenseCreated: false,
      userId: session.user.id,
    }));

    await db.insert(events).values(insertValues);

    revalidateTag(`events-${session.user.id}`, 'everything');

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
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const role = resolveRole(session);

    const eventId = input.eventId?.trim();
    if (!eventId) {
      return { success: false, error: 'Invalid event id.' };
    }

    const [updatedEvent] = await db
      .update(events)
      .set({ kindooLicenseCreated: input.kindooLicenseCreated })
      .where(
        role === 'user'
          ? and(eq(events.id, eventId), eq(events.userId, session.user.id))
          : eq(events.id, eventId)
      )
      .returning();

    if (!updatedEvent) {
      return { success: false, error: 'Event not found.' };
    }

    revalidateTag(`events-${session.user.id}`, 'everything');
    revalidateTag(`events-${session.user.id}-${updatedEvent.building}`, 'everything');

    return { success: true, data: updatedEvent };
  } catch (error) {
    console.error('[setKindooLicenseCreated] Error:', error);
    return { success: false, error: 'Failed to update Kindoo license status.' };
  }
}
