import 'server-only';

import { db } from '@/lib/db';
import { notificationPreferences, smsRoleAccessConfig, type UserRole } from '@/schema/schema';
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

export interface SmsRoleAccessInput {
  adminEnabled: boolean;
  stakeManagerEnabled: boolean;
  wardManagerEnabled: boolean;
  wardUserEnabled: boolean;
}

export interface SmsRoleAccessView extends SmsRoleAccessInput {
  id: string;
}

const SMS_ROLE_ACCESS_CONFIG_ID = 'default';

export const DEFAULT_SMS_ROLE_ACCESS: Omit<SmsRoleAccessView, 'id'> = {
  adminEnabled: true,
  stakeManagerEnabled: false,
  wardManagerEnabled: false,
  wardUserEnabled: false,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: Omit<NotificationPreferenceView, 'userId'> = {
  smsEnabled: false,
  smsPhone: '',
  accessRequestSubmittedSms: true,
  licenseJobCompletedSms: true,
  licenseJobFailedSms: true,
  eventCreatedSms: false,
};

export function canRoleEnableSms(role: UserRole, config: Omit<SmsRoleAccessView, 'id'>) {
  if (role === 'admin') return config.adminEnabled;
  if (role === 'stake_manager') return config.stakeManagerEnabled;
  if (role === 'ward_manager') return config.wardManagerEnabled;
  return config.wardUserEnabled;
}

export async function loadSmsRoleAccessConfig(): Promise<SmsRoleAccessView> {
  const [row] = await db
    .select()
    .from(smsRoleAccessConfig)
    .where(eq(smsRoleAccessConfig.id, SMS_ROLE_ACCESS_CONFIG_ID))
    .limit(1);

  return {
    id: SMS_ROLE_ACCESS_CONFIG_ID,
    adminEnabled: row?.adminEnabled ?? DEFAULT_SMS_ROLE_ACCESS.adminEnabled,
    stakeManagerEnabled: row?.stakeManagerEnabled ?? DEFAULT_SMS_ROLE_ACCESS.stakeManagerEnabled,
    wardManagerEnabled: row?.wardManagerEnabled ?? DEFAULT_SMS_ROLE_ACCESS.wardManagerEnabled,
    wardUserEnabled: row?.wardUserEnabled ?? DEFAULT_SMS_ROLE_ACCESS.wardUserEnabled,
  };
}

export async function upsertSmsRoleAccessConfig(
  input: SmsRoleAccessInput,
  updatedByUserId: string
): Promise<void> {
  await db
    .insert(smsRoleAccessConfig)
    .values({
      id: SMS_ROLE_ACCESS_CONFIG_ID,
      adminEnabled: input.adminEnabled,
      stakeManagerEnabled: input.stakeManagerEnabled,
      wardManagerEnabled: input.wardManagerEnabled,
      wardUserEnabled: input.wardUserEnabled,
      updatedByUserId,
    })
    .onConflictDoUpdate({
      target: smsRoleAccessConfig.id,
      set: {
        adminEnabled: input.adminEnabled,
        stakeManagerEnabled: input.stakeManagerEnabled,
        wardManagerEnabled: input.wardManagerEnabled,
        wardUserEnabled: input.wardUserEnabled,
        updatedByUserId,
        updatedAt: sql`(unixepoch())`,
      },
    });
}

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
