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
  type Ward,
} from '@/schema/schema';
import { eq, and } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddEventInput {
  building: Building;
  ward: Ward;
  name: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  phone?: string;
  email: string;
  description: string;
}

export interface UpdateEventInput extends AddEventInput {
  id: string;
}

export interface EventWithCreator extends Event {
  creatorName: string | null;
  creatorEmail: string | null;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Validation Helper ────────────────────────────────────────────────────────

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
  if (!input.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return 'Valid email is required.';
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

    const validationError = validateEventInput(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const [newEvent] = await db
      .insert(events)
      .values({
        building: input.building,
        ward: input.ward,
        name: input.name.trim(),
        eventDate: input.eventDate.trim(),
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim(),
        phone: input.phone?.trim() || null,
        email: input.email.trim().toLowerCase(),
        description: input.description.trim(),
        userId: session.user.id,
      })
      .returning();

    // Invalidate cache tags for this user's events
    revalidateTag(`events-${session.user.id}`, 'everything');
    revalidateTag(`events-${session.user.id}-${input.building}`, 'everything');

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
        userId: events.userId,
        createdAt: events.createdAt,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(events)
      .innerJoin(users, eq(events.userId, users.id))
      .where(and(eq(events.userId, session.user.id), eq(events.building, building)))
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

    // Ensure user owns this event
    await db.delete(events).where(and(eq(events.id, eventId), eq(events.userId, session.user.id)));

    revalidateTag(`events-${session.user.id}`, 'everything');

    return { success: true };
  } catch (error) {
    console.error('[deleteEvent] Error:', error);
    return { success: false, error: 'Failed to delete event.' };
  }
}

export async function updateEvent(input: UpdateEventInput): Promise<ActionResult<Event>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    if (!input.id?.trim()) {
      return { success: false, error: 'Invalid event id.' };
    }

    const validationError = validateEventInput(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const [updatedEvent] = await db
      .update(events)
      .set({
        building: input.building,
        ward: input.ward,
        name: input.name.trim(),
        eventDate: input.eventDate.trim(),
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim(),
        phone: input.phone?.trim() || null,
        email: input.email.trim().toLowerCase(),
        description: input.description.trim(),
      })
      .where(and(eq(events.id, input.id), eq(events.userId, session.user.id)))
      .returning();

    if (!updatedEvent) {
      return { success: false, error: 'Event not found.' };
    }

    revalidateTag(`events-${session.user.id}`, 'everything');
    revalidateTag(`events-${session.user.id}-${input.building}`, 'everything');

    return { success: true, data: updatedEvent };
  } catch (error) {
    console.error('[updateEvent] Error:', error);
    return { success: false, error: 'Failed to update event.' };
  }
}
