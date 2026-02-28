// src/actions/events.ts
'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { events, type Building, type Event } from '@/schema/schema';
import { eq, and } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AddEventInput {
  building: Building;
  name: string;
  phone?: string;
  email: string;
  description: string;
}

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Validation Helper ────────────────────────────────────────────────────────

function validateEventInput(input: AddEventInput): string | null {
  if (!input.building || !['Stake Center', 'Maples Building'].includes(input.building)) {
    return 'Invalid building selection.';
  }
  if (!input.name?.trim()) return 'Name is required.';
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
        name: input.name.trim(),
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

export async function getEventsByBuilding(building: Building): Promise<ActionResult<Event[]>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.', data: [] };
    }

    const userEvents = await db
      .select()
      .from(events)
      .where(and(eq(events.userId, session.user.id), eq(events.building, building)))
      .orderBy(events.createdAt);

    return { success: true, data: userEvents };
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
