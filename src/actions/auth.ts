'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, USER_ROLES, type UserRole } from '@/schema/schema';
import { BUILDINGS, type Building } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import { getAdminEmails, isAdminEmail } from '@/lib/admin';
import { hashPassword, verifyPassword } from '@/lib/password';
import { put } from '@vercel/blob';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const PASSWORD_MIN_LENGTH = 12;
const MAX_PROFILE_IMAGE_SIZE = 3 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function sanitizeFilename(filename: string) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

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

export async function updateProfileImage(input: {
  image: File | string | null;
}): Promise<ActionResult<{ imageUrl: string }>> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) return { success: false, error: 'Not authenticated.' };

  const image = input.image;
  if (!image || typeof image === 'string') {
    return { success: false, error: 'Please choose an image to upload.' };
  }

  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(image.type)) {
    return { success: false, error: 'Profile photo must be a JPG, PNG, or WebP image.' };
  }

  if (image.size > MAX_PROFILE_IMAGE_SIZE) {
    return { success: false, error: 'Profile photo must be 3MB or less.' };
  }

  const safeName = sanitizeFilename(image.name || 'profile-image');
  const blob = await put(`profiles/${userId}/${Date.now()}-${safeName}`, image, {
    access: 'public',
    contentType: image.type,
  });

  await db.update(users).set({ image: blob.url }).where(eq(users.id, userId));
  return { success: true, data: { imageUrl: blob.url } };
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
