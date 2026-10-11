import 'server-only';

import { db } from '@/lib/db';
import type { EventSmsInput } from '@/lib/sms-message-templates';
import { contacts, events } from '@/schema/schema';
import { eq } from 'drizzle-orm';

/** Load event + contact details used by license-job complete/fail SMS. */
export async function loadEventSmsDetails(eventId: string): Promise<EventSmsInput | null> {
  const [row] = await db
    .select({
      description: events.description,
      eventType: events.eventType,
      eventDate: events.eventDate,
      startTime: events.startTime,
      endTime: events.endTime,
      building: events.building,
      contactName: contacts.name,
      ward: contacts.ward,
    })
    .from(events)
    .leftJoin(contacts, eq(events.contactId, contacts.id))
    .where(eq(events.id, eventId))
    .limit(1);
  return row ?? null;
}
