'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, USER_ROLES, type UserRole } from '@/schema/schema';
import { BUILDINGS, type Building } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import { getAdminEmails, isAdminEmail } from '@/lib/admin';
import { hashPassword, verifyPassword } from '@/lib/password';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const PASSWORD_MIN_LENGTH = 12;
const LICENSE_LEAD_MIN_DAYS = 0;
const LICENSE_LEAD_MAX_DAYS = 14;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireAdmin() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;

  if (!email || !userId) {
    return { ok: false, error: 'Not authorized.' };
  }

  if (isAdminEmail(email)) {
    return { ok: true, email, userId } as const;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!dbUser || dbUser.role !== 'admin') {
    return { ok: false, error: 'Not authorized.' };
  }

  return { ok: true, email, userId } as const;
}

export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
  role?: UserRole;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const password = input.password;

  if (!isValidEmail(email)) return { success: false, error: 'Valid email is required.' };
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return {
      success: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return { success: false, error: 'User already exists.' };

  const roleInput: UserRole = USER_ROLES.includes(input.role ?? 'user')
    ? (input.role ?? 'user')
    : 'user';
  const role: UserRole = isAdminEmail(email) ? 'admin' : roleInput;

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, name, passwordHash, role });

  return { success: true };
}

export async function listUsers(): Promise<
  ActionResult<{ id: string; email: string; name: string | null; role: UserRole }[]>
> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const allUsers = await db.select().from(users);
  return {
    success: true,
    data: allUsers
      .map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        role: (user.role ?? 'user') as UserRole,
      }))
      .sort((a, b) => {
        if (a.id === admin.userId && b.id !== admin.userId) return -1;
        if (b.id === admin.userId && a.id !== admin.userId) return 1;
        return a.email.localeCompare(b.email);
      }),
  };
}

export async function adminSetUserRole(input: {
  userId: string;
  role: UserRole;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  if (!userId) return { success: false, error: 'Invalid user id.' };

  const role: UserRole = USER_ROLES.includes(input.role) ? input.role : 'user';

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };

  const resolvedRole = isAdminEmail(user.email) ? 'admin' : role;
  await db.update(users).set({ role: resolvedRole }).where(eq(users.id, userId));

  return { success: true };
}

export async function adminSetUserPassword(input: {
  userId: string;
  password: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  const password = input.password;
  const confirmPassword = input.confirmPassword;

  if (!userId) return { success: false, error: 'Invalid user id.' };
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return {
      success: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password !== confirmPassword) return { success: false, error: 'Passwords do not match.' };

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  return { success: true };
}

export async function adminDeleteUser(input: { userId: string }): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  if (!userId) return { success: false, error: 'Invalid user id.' };

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };

  if ((admin.email ?? '').toLowerCase() === user.email.toLowerCase()) {
    return { success: false, error: 'You cannot delete your own account.' };
  }

  if (isAdminEmail(user.email)) {
    return { success: false, error: 'Cannot delete another admin account.' };
  }

  await db.delete(users).where(eq(users.id, userId));
  return { success: true };
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (!email) return { success: false, error: 'Not authenticated.' };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = existing[0];

  if (!user?.passwordHash) return { success: false, error: 'Password not set.' };

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) return { success: false, error: 'Current password is incorrect.' };

  if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
    return {
      success: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  if (input.newPassword !== input.confirmPassword) {
    return { success: false, error: 'Passwords do not match.' };
  }

  const passwordHash = await hashPassword(input.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

  return { success: true };
}

export async function changeProfile(input: { name: string }): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) return { success: false, error: 'Not authenticated.' };

  const name = input.name.trim();
  if (!name) return { success: false, error: 'Name is required.' };
  if (name.length > 80) return { success: false, error: 'Name must be 80 characters or less.' };

  await db.update(users).set({ name }).where(eq(users.id, userId));
  return { success: true };
}

export async function updateLicenseLeadDays(input: {
  leadDays: number;
}): Promise<ActionResult<{ leadDays: number }>> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) return { success: false, error: 'Not authenticated.' };

  const leadDays = Math.round(input.leadDays);
  if (!Number.isFinite(leadDays)) {
    return { success: false, error: 'Lead time must be a number.' };
  }
  if (leadDays < LICENSE_LEAD_MIN_DAYS || leadDays > LICENSE_LEAD_MAX_DAYS) {
    return {
      success: false,
      error: `Lead time must be between ${LICENSE_LEAD_MIN_DAYS} and ${LICENSE_LEAD_MAX_DAYS} days.`,
    };
  }

  await db.update(users).set({ licenseLeadDays: leadDays }).where(eq(users.id, userId));
  return { success: true, data: { leadDays } };
}

export async function updateDefaultBuilding(input: {
  defaultBuilding: Building;
}): Promise<ActionResult<{ defaultBuilding: Building }>> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) return { success: false, error: 'Not authenticated.' };

  const defaultBuilding = input.defaultBuilding;
  if (!BUILDINGS.includes(defaultBuilding)) {
    return { success: false, error: 'Invalid building selection.' };
  }

  await db.update(users).set({ defaultBuilding }).where(eq(users.id, userId));
  return { success: true, data: { defaultBuilding } };
}

export async function listAdmins(): Promise<ActionResult<{ emails: string[] }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  return { success: true, data: { emails: getAdminEmails() } };
}
