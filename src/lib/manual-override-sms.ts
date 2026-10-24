import 'server-only';

import { db } from '@/lib/db';
import { listEventCreatedRecipientIds } from '@/lib/events-service';
import { loadEventSmsDetails } from '@/lib/license-job-sms';
import { sendNotificationEventSms } from '@/lib/notifications';
import { isSmsConfigured } from '@/lib/sms';
import {
  buildEventHandledManuallyReopenedSms,
  buildEventHandledManuallySms,
} from '@/lib/sms-message-templates';
import { contacts, events, type ManualOverrideReason } from '@/schema/schema';
import { eq } from 'drizzle-orm';

export interface ManualOverrideSmsSummary {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Set when nothing was attempted on purpose. */
  skippedReason?: 'sms-not-configured' | 'no-recipients' | 'error';
}

/** Injected in tests so no real text can go out. Defaults to the app's real sender. */
export interface ManualOverrideSmsDeps {
  sendSms?: typeof sendNotificationEventSms;
  isSmsConfigured?: () => boolean;
}

const EMPTY: ManualOverrideSmsSummary = { attempted: 0, sent: 0, skipped: 0, failed: 0 };

/**
 * Texts the people who are subscribed to texts for an event when an admin marks it as handled
 * manually, or reopens it. Recipients and opt-ins are the existing ones, nothing new:
 *  - the event's creator, who gets the "Kindoo access ready" text (license_job_completed opt-in)
 *  - admins, stake managers and the ward's managers, who get the "new booking" text
 *    (event_created opt-in)
 * The admin making the change is never texted. Each person gets one text. The admin note never
 * goes into the message. This never throws: a text problem must not block the mark or reopen.
 */
export async function notifyManualOverrideChange(
  input: {
    eventId: string;
    actorUserId: string;
    kind: 'marked' | 'reopened';
    reason?: ManualOverrideReason | null;
  },
  deps: ManualOverrideSmsDeps = {}
): Promise<ManualOverrideSmsSummary> {
  try {
    const send = deps.sendSms ?? sendNotificationEventSms;
    const configured = (deps.isSmsConfigured ?? isSmsConfigured)();
    if (!configured) return { ...EMPTY, skippedReason: 'sms-not-configured' };

    const [row] = await db
      .select({ creatorUserId: events.userId, ward: contacts.ward })
      .from(events)
      .innerJoin(contacts, eq(events.contactId, contacts.id))
      .where(eq(events.id, input.eventId))
      .limit(1);
    const details = await loadEventSmsDetails(input.eventId);
    if (!row || !details) return { ...EMPTY, skippedReason: 'error' };

    const message =
      input.kind === 'marked'
        ? buildEventHandledManuallySms({ ...details, reason: input.reason ?? 'other' })
        : buildEventHandledManuallyReopenedSms(details);

    const creatorIds = row.creatorUserId === input.actorUserId ? [] : [row.creatorUserId];
    const audienceIds = (await listEventCreatedRecipientIds(row.ward, input.actorUserId)).filter(
      (id) => !creatorIds.includes(id)
    );

    if (creatorIds.length === 0 && audienceIds.length === 0) {
      return { ...EMPTY, skippedReason: 'no-recipients' };
    }

    const summary: ManualOverrideSmsSummary = { ...EMPTY };
    const groups = [
      { eventKey: 'license_job_completed' as const, recipientUserIds: creatorIds },
      { eventKey: 'event_created' as const, recipientUserIds: audienceIds },
    ];
    for (const group of groups) {
      if (group.recipientUserIds.length === 0) continue;
      try {
        const result = await send({ ...group, message });
        summary.sent += result.sent;
        summary.skipped += result.skipped;
        summary.failed += result.failed;
        summary.attempted += result.sent + result.skipped + result.failed;
      } catch (error) {
        console.error('[manual-override-sms] send failed:', error);
        summary.failed += group.recipientUserIds.length;
        summary.attempted += group.recipientUserIds.length;
      }
    }
    return summary;
  } catch (error) {
    console.error('[manual-override-sms] Failed to send texts:', error);
    return { ...EMPTY, skippedReason: 'error' };
  }
}
