'use server';

import { auth } from '@/lib/auth';
import {
  loadNotificationPreferencesForUser,
  upsertNotificationPreferencesForUser,
} from '@/lib/notification-preferences';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function getNotificationPreferences(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return { success: false, error: 'Not authenticated.' };
  }

  const data = await loadNotificationPreferencesForUser(userId);
  return { success: true, data };
}

export async function updateNotificationPreferences(input: {
  smsEnabled: boolean;
  smsPhone: string;
  accessRequestSubmittedSms: boolean;
  licenseJobCompletedSms: boolean;
  licenseJobFailedSms: boolean;
  eventCreatedSms: boolean;
}): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return { success: false, error: 'Not authenticated.' };
  }

  await upsertNotificationPreferencesForUser(userId, {
    smsEnabled: input.smsEnabled,
    smsPhone: input.smsPhone,
    accessRequestSubmittedSms: input.accessRequestSubmittedSms,
    licenseJobCompletedSms: input.licenseJobCompletedSms,
    licenseJobFailedSms: input.licenseJobFailedSms,
    eventCreatedSms: input.eventCreatedSms,
  });

  return { success: true };
}
