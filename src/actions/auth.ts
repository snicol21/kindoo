'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import { getAdminEmails, isAdminEmail } from '@/lib/admin';
import { generateResetToken, hashPassword, hashResetToken, verifyPassword } from '@/lib/password';
import { sendPasswordResetEmail } from '@/lib/mailer';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const PASSWORD_MIN_LENGTH = 12;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60;

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function requireAdmin() {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (!email || !isAdminEmail(email)) {
    return { ok: false, error: 'Not authorized.' };
  }

  return { ok: true, email } as const;
}

export async function createUser(input: {
  email: string;
  name?: string;
  password: string;
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

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({ email, name, passwordHash });

  return { success: true };
}

export async function sendResetEmail(input: { email: string }): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { success: false, error: 'Valid email is required.' };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = existing[0];

  if (!user) {
    return { success: true };
  }

  const token = generateResetToken();
  const resetTokenHash = hashResetToken(token);
  const resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.update(users).set({ resetTokenHash, resetTokenExpires }).where(eq(users.id, user.id));

  const baseUrl = process.env.AUTH_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/auth/reset/${token}`;

  await sendPasswordResetEmail(email, resetUrl);

  return { success: true };
}

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { success: true };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = existing[0];

  if (!user) return { success: true };

  const token = generateResetToken();
  const resetTokenHash = hashResetToken(token);
  const resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.update(users).set({ resetTokenHash, resetTokenExpires }).where(eq(users.id, user.id));

  const baseUrl = process.env.AUTH_URL ?? 'http://localhost:3000';
  const resetUrl = `${baseUrl}/auth/reset/${token}`;

  await sendPasswordResetEmail(email, resetUrl);

  return { success: true };
}

export async function resetPassword(input: {
  token: string;
  password: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const token = input.token.trim();
  const password = input.password;
  const confirmPassword = input.confirmPassword;

  if (!token) return { success: false, error: 'Invalid reset token.' };
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return {
      success: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }
  if (password !== confirmPassword) return { success: false, error: 'Passwords do not match.' };

  const resetTokenHash = hashResetToken(token);
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.resetTokenHash, resetTokenHash))
    .limit(1);
  const user = existing[0];

  if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
    return { success: false, error: 'Reset token is invalid or expired.' };
  }

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash, resetTokenHash: null, resetTokenExpires: null })
    .where(eq(users.id, user.id));

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

export async function listAdmins(): Promise<ActionResult<{ emails: string[] }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  return { success: true, data: { emails: getAdminEmails() } };
}
