import 'server-only';

import { db } from '@/lib/db';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferenceView,
} from '@/lib/notification-preferences';
import { normalizePhoneToE164, sendSms } from '@/lib/sms';
import {
  notificationOutbox,
  notificationPreferences,
  users,
  type NotificationEventKey,
} from '@/schema/schema';
import { and, eq, inArray } from 'drizzle-orm';

interface SendNotificationEventInput {
  eventKey: NotificationEventKey;
  recipientUserIds: string[];
  message: string;
}

const EVENT_PREF_FIELD: Record<
  NotificationEventKey,
  keyof Pick<
    NotificationPreferenceView,
    | 'accessRequestSubmittedSms'
    | 'licenseJobCompletedSms'
    | 'licenseJobFailedSms'
    | 'eventCreatedSms'
  >
> = {
  access_request_submitted: 'accessRequestSubmittedSms',
  license_job_completed: 'licenseJobCompletedSms',
  license_job_failed: 'licenseJobFailedSms',
  event_created: 'eventCreatedSms',
};

export async function sendNotificationEventSms(input: SendNotificationEventInput) {
  const recipientIds = Array.from(new Set(input.recipientUserIds.map((id) => id.trim()))).filter(
    Boolean
  );

  if (recipientIds.length === 0) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const rows = await db
    .select({
      userId: users.id,
      userPhone: users.phone,
      smsEnabled: notificationPreferences.smsEnabled,
      smsPhone: notificationPreferences.smsPhone,
      accessRequestSubmittedSms: notificationPreferences.accessRequestSubmittedSms,
      licenseJobCompletedSms: notificationPreferences.licenseJobCompletedSms,
      licenseJobFailedSms: notificationPreferences.licenseJobFailedSms,
      eventCreatedSms: notificationPreferences.eventCreatedSms,
    })
    .from(users)
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
    .where(inArray(users.id, recipientIds));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  const prefField = EVENT_PREF_FIELD[input.eventKey];

  for (const row of rows) {
    const prefEnabled = row[prefField] ?? DEFAULT_NOTIFICATION_PREFERENCES[prefField];
    const smsEnabled = row.smsEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.smsEnabled;
    if (!smsEnabled || !prefEnabled) {
      skipped += 1;
      continue;
    }

    const phoneE164 = normalizePhoneToE164(row.smsPhone ?? row.userPhone);
    if (!phoneE164) {
      skipped += 1;
      continue;
    }

    const [outbox] = await db
      .insert(notificationOutbox)
      .values({
        eventKey: input.eventKey,
        recipientUserId: row.userId,
        phoneE164,
        message: input.message,
        status: 'pending',
      })
      .returning({ id: notificationOutbox.id });

    if (!outbox?.id) {
      failed += 1;
      continue;
    }

    const sendResult = await sendSms({
      to: phoneE164,
      body: input.message,
    });

    if (sendResult.ok) {
      await db
        .update(notificationOutbox)
        .set({
          status: 'sent',
          attempts: 1,
          providerMessageId: sendResult.providerMessageId,
          providerError: null,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(notificationOutbox.id, outbox.id), eq(notificationOutbox.status, 'pending')));
      sent += 1;
    } else {
      await db
        .update(notificationOutbox)
        .set({
          status: 'failed',
          attempts: 1,
          providerError: sendResult.error.slice(0, 4000),
          updatedAt: new Date(),
        })
        .where(and(eq(notificationOutbox.id, outbox.id), eq(notificationOutbox.status, 'pending')));
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}
