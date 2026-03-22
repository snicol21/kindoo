'use server';

import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  canRoleEnableSms,
  loadNotificationPreferencesForUser,
  loadSmsRoleAccessConfig,
  upsertNotificationPreferencesForUser,
  upsertSmsRoleAccessConfig,
} from '@/lib/notification-preferences';
import { users } from '@/schema/schema';
import { eq } from 'drizzle-orm';

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

  const sessionEmail = session?.user?.email ?? null;
  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const role = isAdminEmail(sessionEmail) ? 'admin' : (dbUser?.role ?? 'ward_user');
  const roleAccessConfig = await loadSmsRoleAccessConfig();
  const canEnableSms = canRoleEnableSms(role, roleAccessConfig);
  const smsEnabled = canEnableSms ? input.smsEnabled : false;

  await upsertNotificationPreferencesForUser(userId, {
    smsEnabled,
    smsPhone: input.smsPhone,
    accessRequestSubmittedSms: input.accessRequestSubmittedSms,
    licenseJobCompletedSms: input.licenseJobCompletedSms,
    licenseJobFailedSms: input.licenseJobFailedSms,
    eventCreatedSms: input.eventCreatedSms,
  });

  return { success: true };
}

export async function getSmsRoleAccessConfig(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const sessionEmail = session?.user?.email ?? null;

  if (!userId) {
    return { success: false, error: 'Not authenticated.' };
  }

  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const isAdmin = isAdminEmail(sessionEmail) || dbUser?.role === 'admin';
  if (!isAdmin) {
    return { success: false, error: 'Not authorized.' };
  }

  const data = await loadSmsRoleAccessConfig();
  return { success: true, data };
}

export async function updateSmsRoleAccessConfig(input: {
  adminEnabled: boolean;
  stakeManagerEnabled: boolean;
  wardManagerEnabled: boolean;
  wardUserEnabled: boolean;
}): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const sessionEmail = session?.user?.email ?? null;

  if (!userId) {
    return { success: false, error: 'Not authenticated.' };
  }

  const [dbUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const isAdmin = isAdminEmail(sessionEmail) || dbUser?.role === 'admin';
  if (!isAdmin) {
    return { success: false, error: 'Not authorized.' };
  }

  await upsertSmsRoleAccessConfig(
    {
      adminEnabled: input.adminEnabled,
      stakeManagerEnabled: input.stakeManagerEnabled,
      wardManagerEnabled: input.wardManagerEnabled,
      wardUserEnabled: input.wardUserEnabled,
    },
    userId
  );

  return { success: true };
}
