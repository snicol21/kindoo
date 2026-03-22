import 'server-only';

import { db } from '@/lib/db';
import { notificationPreferences } from '@/schema/schema';
import { normalizePhoneForStorage } from '@/utils/phoneUtils';
import { eq, sql } from 'drizzle-orm';

export interface NotificationPreferenceInput {
  smsEnabled: boolean;
  smsPhone?: string;
  accessRequestSubmittedSms: boolean;
  licenseJobCompletedSms: boolean;
  licenseJobFailedSms: boolean;
  eventCreatedSms: boolean;
}

export interface NotificationPreferenceView extends NotificationPreferenceInput {
  userId: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferenceView, 'userId'> = {
  smsEnabled: false,
  smsPhone: '',
  accessRequestSubmittedSms: true,
  licenseJobCompletedSms: true,
  licenseJobFailedSms: true,
  eventCreatedSms: false,
};

export async function loadNotificationPreferencesForUser(
  userId: string
): Promise<NotificationPreferenceView> {
  const [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  return {
    userId,
    smsEnabled: row?.smsEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.smsEnabled,
    smsPhone: row?.smsPhone ?? DEFAULT_NOTIFICATION_PREFERENCES.smsPhone,
    accessRequestSubmittedSms:
      row?.accessRequestSubmittedSms ?? DEFAULT_NOTIFICATION_PREFERENCES.accessRequestSubmittedSms,
    licenseJobCompletedSms:
      row?.licenseJobCompletedSms ?? DEFAULT_NOTIFICATION_PREFERENCES.licenseJobCompletedSms,
    licenseJobFailedSms:
      row?.licenseJobFailedSms ?? DEFAULT_NOTIFICATION_PREFERENCES.licenseJobFailedSms,
    eventCreatedSms: row?.eventCreatedSms ?? DEFAULT_NOTIFICATION_PREFERENCES.eventCreatedSms,
  };
}

export async function upsertNotificationPreferencesForUser(
  userId: string,
  input: NotificationPreferenceInput
): Promise<void> {
  const smsPhone = normalizePhoneForStorage(input.smsPhone);

  await db
    .insert(notificationPreferences)
    .values({
      userId,
      smsEnabled: input.smsEnabled,
      smsPhone: smsPhone ?? null,
      accessRequestSubmittedSms: input.accessRequestSubmittedSms,
      licenseJobCompletedSms: input.licenseJobCompletedSms,
      licenseJobFailedSms: input.licenseJobFailedSms,
      eventCreatedSms: input.eventCreatedSms,
    })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: {
        smsEnabled: input.smsEnabled,
        smsPhone: smsPhone ?? null,
        accessRequestSubmittedSms: input.accessRequestSubmittedSms,
        licenseJobCompletedSms: input.licenseJobCompletedSms,
        licenseJobFailedSms: input.licenseJobFailedSms,
        eventCreatedSms: input.eventCreatedSms,
        updatedAt: sql`(unixepoch())`,
      },
    });
}
