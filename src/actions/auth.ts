'use server';

import { getAdminEmails, isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/password';
import { canAccessUserAdmin, canAssignRole, canManageUserInWard } from '@/lib/permissions';
import {
  BUILDINGS,
  USER_ROLES,
  users,
  WARDS,
  type Building,
  type UserRole,
  type Ward,
} from '@/schema/schema';
import { normalizePhoneForStorage } from '@/utils/phoneUtils';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';

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

async function requireUserAdmin() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const userId = session?.user?.id ?? null;

  if (!email || !userId) {
    return { ok: false, error: 'Not authorized.' } as const;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const role: UserRole = isAdminEmail(email)
    ? 'admin'
    : ((dbUser?.role ?? 'ward_user') as UserRole);

  if (!dbUser || !canAccessUserAdmin(role)) {
    return { ok: false, error: 'Not authorized.' } as const;
  }

  return {
    ok: true,
    email,
    userId,
    role,
    ward: dbUser.ward,
  } as const;
}

export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
  role?: UserRole;
  ward?: Ward;
  phone: string;
}): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const password = input.password;
  const ward = input.ward;
  const phone = normalizePhoneForStorage(input.phone);

  if (!isValidEmail(email)) return { success: false, error: 'Valid email is required.' };
  if (!ward || !WARDS.includes(ward)) {
    return { success: false, error: 'Ward is required.' };
  }
  if (!phone || !/^[\d\s\-+().]{7,20}$/.test(phone)) {
    return { success: false, error: 'Valid phone number is required.' };
  }
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return {
      success: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return { success: false, error: 'User already exists.' };

  const roleInput: UserRole = USER_ROLES.includes(input.role ?? 'ward_user')
    ? (input.role ?? 'ward_user')
    : 'ward_user';
  if (!canAssignRole(admin.role, roleInput)) {
    return { success: false, error: 'You are not allowed to assign that role.' };
  }
  if (admin.role === 'ward_manager' && ward !== admin.ward) {
    return { success: false, error: 'You can only create users in your ward.' };
  }
  const role: UserRole = isAdminEmail(email) ? 'admin' : roleInput;

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, name, passwordHash, role, ward, phone });

  return { success: true };
}

export async function listUsers(): Promise<
  ActionResult<
    { id: string; email: string; name: string | null; role: UserRole; ward: Ward; phone: string }[]
  >
> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const allUsers = await db.select().from(users);
  const visibleUsers =
    admin.role === 'ward_manager'
      ? allUsers.filter((user) => user.ward === admin.ward && user.role === 'ward_user')
      : allUsers;
  return {
    success: true,
    data: visibleUsers
      .map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        role: (user.role ?? 'ward_user') as UserRole,
        ward: user.ward,
        phone: user.phone,
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
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  if (!userId) return { success: false, error: 'Invalid user id.' };

  const role: UserRole = USER_ROLES.includes(input.role) ? input.role : 'ward_user';

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };
  const targetRole = (user.role ?? 'ward_user') as UserRole;

  if (
    !canManageUserInWard({
      actorRole: admin.role,
      actorWard: admin.ward,
      targetRole,
      targetWard: user.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to change this user.' };
  }
  if (!canAssignRole(admin.role, role)) {
    return { success: false, error: 'You are not allowed to assign that role.' };
  }

  const resolvedRole = isAdminEmail(user.email) ? 'admin' : role;
  await db.update(users).set({ role: resolvedRole }).where(eq(users.id, userId));

  return { success: true };
}

export async function adminSetUserName(input: {
  userId: string;
  name: string;
}): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  const name = input.name.trim();

  if (!userId) return { success: false, error: 'Invalid user id.' };
  if (name.length > 80) return { success: false, error: 'Name must be 80 characters or less.' };

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };

  if (
    !canManageUserInWard({
      actorRole: admin.role,
      actorWard: admin.ward,
      targetRole: (user.role ?? 'ward_user') as UserRole,
      targetWard: user.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to change this user.' };
  }

  await db
    .update(users)
    .set({ name: name || null })
    .where(eq(users.id, userId));
  return { success: true };
}

export async function adminSetUserWard(input: {
  userId: string;
  ward: Ward;
}): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  const ward = input.ward;

  if (!userId) return { success: false, error: 'Invalid user id.' };
  if (!WARDS.includes(ward)) return { success: false, error: 'Invalid ward.' };

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };

  if (
    !canManageUserInWard({
      actorRole: admin.role,
      actorWard: admin.ward,
      targetRole: (user.role ?? 'ward_user') as UserRole,
      targetWard: user.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to change this user.' };
  }

  if (admin.role === 'ward_manager' && ward !== admin.ward) {
    return { success: false, error: 'You can only assign users to your ward.' };
  }

  await db.update(users).set({ ward }).where(eq(users.id, userId));
  return { success: true };
}

export async function adminSetUserEmail(input: {
  userId: string;
  email: string;
}): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  const email = input.email.trim().toLowerCase();

  if (!userId) return { success: false, error: 'Invalid user id.' };
  if (!isValidEmail(email)) return { success: false, error: 'Valid email is required.' };

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };

  if (
    !canManageUserInWard({
      actorRole: admin.role,
      actorWard: admin.ward,
      targetRole: (user.role ?? 'ward_user') as UserRole,
      targetWard: user.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to change this user.' };
  }

  if (admin.role !== 'admin' && isAdminEmail(email)) {
    return { success: false, error: 'You are not allowed to assign an admin email.' };
  }

  const duplicate = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (duplicate[0] && duplicate[0].id !== userId) {
    return { success: false, error: 'A user with this email already exists.' };
  }

  await db.update(users).set({ email }).where(eq(users.id, userId));
  return { success: true };
}

export async function adminSetUserPhone(input: {
  userId: string;
  phone: string;
}): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const userId = input.userId.trim();
  const phone = normalizePhoneForStorage(input.phone);

  if (!userId) return { success: false, error: 'Invalid user id.' };
  if (!phone || !/^[\d\s\-+().]{7,20}$/.test(phone)) {
    return { success: false, error: 'Valid phone number is required.' };
  }

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };

  if (
    !canManageUserInWard({
      actorRole: admin.role,
      actorWard: admin.ward,
      targetRole: (user.role ?? 'ward_user') as UserRole,
      targetWard: user.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to change this user.' };
  }

  await db.update(users).set({ phone }).where(eq(users.id, userId));
  return { success: true };
}

export async function adminSetUserPassword(input: {
  userId: string;
  password: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const admin = await requireUserAdmin();
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

  const existing = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = existing[0];
  if (!user) return { success: false, error: 'User not found.' };

  if (
    !canManageUserInWard({
      actorRole: admin.role,
      actorWard: admin.ward,
      targetRole: (user.role ?? 'ward_user') as UserRole,
      targetWard: user.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to change this user.' };
  }

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

  return { success: true };
}

export async function adminDeleteUser(input: { userId: string }): Promise<ActionResult> {
  const admin = await requireUserAdmin();
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

  if (
    !canManageUserInWard({
      actorRole: admin.role,
      actorWard: admin.ward,
      targetRole: (user.role ?? 'ward_user') as UserRole,
      targetWard: user.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to delete this user.' };
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

export async function changeProfile(input: { name: string; phone: string }): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) return { success: false, error: 'Not authenticated.' };

  const name = input.name.trim();
  const phone = normalizePhoneForStorage(input.phone);
  if (!name) return { success: false, error: 'Name is required.' };
  if (name.length > 80) return { success: false, error: 'Name must be 80 characters or less.' };
  if (!phone || !/^[\d\s\-+().]{7,20}$/.test(phone)) {
    return { success: false, error: 'Valid phone number is required.' };
  }

  await db.update(users).set({ name, phone }).where(eq(users.id, userId));
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

  const [dbUser] = await db
    .select({ role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!dbUser) return { success: false, error: 'Not authenticated.' };

  const role: UserRole = isAdminEmail(dbUser.email)
    ? 'admin'
    : ((dbUser.role ?? 'ward_user') as UserRole);

  if (role !== 'stake_manager') {
    return { success: false, error: 'Only stake managers can change the default building.' };
  }

  await db.update(users).set({ defaultBuilding }).where(eq(users.id, userId));
  return { success: true, data: { defaultBuilding } };
}

export async function listAdmins(): Promise<ActionResult<{ emails: string[] }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  return { success: true, data: { emails: getAdminEmails() } };
}
