'use server';

import { getAdminEmails, isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { hashPassword, verifyPassword } from '@/lib/password';
import {
  canAccessUserAdmin,
  canAssignRole,
  canManageUserInWard,
  ROLE_LABELS,
} from '@/lib/permissions';
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

function generateTemporaryPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
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
  role?: UserRole;
  ward?: Ward;
  phone: string;
  sendCredentialsEmail?: boolean;
}): Promise<ActionResult<{ emailWarning?: string }>> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const ward = input.ward;
  const phone = normalizePhoneForStorage(input.phone);
  const shouldSendCredentialsEmail = input.sendCredentialsEmail !== false;

  if (!isValidEmail(email)) return { success: false, error: 'Valid email is required.' };
  if (!ward || !WARDS.includes(ward)) {
    return { success: false, error: 'Ward is required.' };
  }
  if (!phone || !/^[\d\s\-+().]{7,20}$/.test(phone)) {
    return { success: false, error: 'Valid phone number is required.' };
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

  const temporaryPassword = generateTemporaryPassword();
  if (temporaryPassword.length < PASSWORD_MIN_LENGTH) {
    return { success: false, error: 'Failed to generate temporary password.' };
  }

  const passwordHash = await hashPassword(temporaryPassword);
  await db.insert(users).values({
    email,
    name,
    passwordHash,
    role,
    ward,
    phone,
    mustChangePassword: true,
  });

  if (!shouldSendCredentialsEmail) {
    return {
      success: true,
      data: { emailWarning: 'User created. Credentials email was not sent.' },
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const grantedRoleLabel = ROLE_LABELS[role] ?? role;
  const includeWardInEmail = role === 'ward_manager' || role === 'ward_user';
  const wardTextLine = includeWardInEmail ? `Ward: ${ward}\n` : '';
  const wardHtmlLine = includeWardInEmail
    ? `<tr><td style="padding: 4px 0;"><strong>Ward:</strong> ${ward}</td></tr>`
    : '';
  const logoUrl = `${appUrl}/icons/favicon-96x96.png`;

  const emailResult = await sendEmail({
    to: email,
    subject: 'Your DigitalFob account has been created',
    text: `Hello ${name ?? email},\n\nYour account has been created.\n\nRole granted: ${grantedRoleLabel}\n${wardTextLine}\nSign in here: ${appUrl}/auth/signin\nEmail: ${email}\nTemporary password: ${temporaryPassword}\n\nFor security, you must change this temporary password immediately after your first sign in.\n`,
    html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${logoUrl}" width="32" height="32" alt="DigitalFob" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;font-size:18px;font-weight:700;color:#0f172a;">DigitalFob</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0f172a;">Account created</h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">Hello ${name ?? email}, your account has been created.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.6;color:#0f172a;">
                <tr><td style="padding: 4px 0;"><strong>Role granted:</strong> ${grantedRoleLabel}</td></tr>
                ${wardHtmlLine}
                <tr><td style="padding: 4px 0;"><strong>Email:</strong> ${email}</td></tr>
                <tr><td style="padding: 4px 0;"><strong>Temporary password:</strong> ${temporaryPassword}</td></tr>
              </table>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                <a href="${appUrl}/auth/signin" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a>
              </p>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">For security, you must change this temporary password immediately after your first sign in.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  });

  if (!emailResult.ok) {
    return {
      success: true,
      data: {
        emailWarning: `User created, but email delivery failed: ${emailResult.error}`,
      },
    };
  }

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

  const isSelfWardChange = user.id === admin.userId;
  const canSelfChangeWard = admin.role === 'admin' || admin.role === 'stake_manager';

  if (
    !(isSelfWardChange && canSelfChangeWard) &&
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

export async function adminSendUserCredentials(input: {
  userId: string;
}): Promise<ActionResult<{ emailWarning?: string }>> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };
  try {
    const userId = input.userId.trim();
    if (!userId) return { success: false, error: 'Invalid user id.' };

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

    const temporaryPassword = generateTemporaryPassword();
    if (temporaryPassword.length < PASSWORD_MIN_LENGTH) {
      return { success: false, error: 'Failed to generate temporary password.' };
    }

    const passwordHash = await hashPassword(temporaryPassword);
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(users.id, userId));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const role = (user.role ?? 'ward_user') as UserRole;
    const grantedRoleLabel = ROLE_LABELS[role] ?? role;
    const includeWardInEmail = role === 'ward_manager' || role === 'ward_user';
    const wardTextLine = includeWardInEmail ? `Ward: ${user.ward}\n` : '';
    const wardHtmlLine = includeWardInEmail
      ? `<tr><td style="padding: 4px 0;"><strong>Ward:</strong> ${user.ward}</td></tr>`
      : '';
    const logoUrl = `${appUrl}/icons/favicon-96x96.png`;

    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Your DigitalFob credentials have been reset',
      text: `Hello ${user.name ?? user.email},\n\nYour credentials were reset by an administrator.\n\nRole: ${grantedRoleLabel}\n${wardTextLine}\nSign in here: ${appUrl}/auth/signin\nEmail: ${user.email}\nTemporary password: ${temporaryPassword}\n\nFor security, you must change this temporary password immediately after sign in.\n`,
      html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${logoUrl}" width="32" height="32" alt="DigitalFob" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;font-size:18px;font-weight:700;color:#0f172a;">DigitalFob</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0f172a;">Credentials reset</h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">Hello ${user.name ?? user.email}, your credentials were reset by an administrator.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.6;color:#0f172a;">
                <tr><td style="padding: 4px 0;"><strong>Role:</strong> ${grantedRoleLabel}</td></tr>
                ${wardHtmlLine}
                <tr><td style="padding: 4px 0;"><strong>Email:</strong> ${user.email}</td></tr>
                <tr><td style="padding: 4px 0;"><strong>Temporary password:</strong> ${temporaryPassword}</td></tr>
              </table>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                <a href="${appUrl}/auth/signin" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a>
              </p>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">For security, you must change this temporary password immediately after sign in.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
    });

    if (!emailResult.ok) {
      return {
        success: true,
        data: {
          emailWarning: `Credentials reset, but email delivery failed: ${emailResult.error}`,
        },
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send credentials.',
    };
  }
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

export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();

  if (!isValidEmail(email)) {
    return { success: false, error: 'Enter a valid email address.' };
  }

  try {
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = existing[0];

    // Always return a generic success response to avoid account enumeration.
    if (!user?.passwordHash) {
      return { success: true };
    }

    const temporaryPassword = generateTemporaryPassword();
    if (temporaryPassword.length < PASSWORD_MIN_LENGTH) {
      return { success: true };
    }

    const passwordHash = await hashPassword(temporaryPassword);
    const previousPasswordHash = user.passwordHash;
    const previousMustChangePassword = user.mustChangePassword;

    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(users.id, user.id));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const logoUrl = `${appUrl}/icons/favicon-96x96.png`;
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Your DigitalFob password reset request',
      text: `Hello ${user.name ?? user.email},\n\nWe received a request to reset your password.\n\nSign in here: ${appUrl}/auth/signin\nEmail: ${user.email}\nTemporary password: ${temporaryPassword}\n\nFor security, you must change this temporary password immediately after sign in.\n\nIf you did not request this, please contact an administrator.\n`,
      html: `
      <div style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${logoUrl}" width="32" height="32" alt="DigitalFob" style="display:block;border:0;" />
                  </td>
                  <td style="vertical-align:middle;font-size:18px;font-weight:700;color:#0f172a;">DigitalFob</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0f172a;">Password reset requested</h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">Hello ${user.name ?? user.email}, we received a request to reset your password.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.6;color:#0f172a;">
                <tr><td style="padding: 4px 0;"><strong>Email:</strong> ${user.email}</td></tr>
                <tr><td style="padding: 4px 0;"><strong>Temporary password:</strong> ${temporaryPassword}</td></tr>
              </table>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                <a href="${appUrl}/auth/signin" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a>
              </p>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">For security, you must change this temporary password immediately after sign in.</p>
            </td>
          </tr>
        </table>
      </div>
    `,
    });

    if (!emailResult.ok) {
      await db
        .update(users)
        .set({
          passwordHash: previousPasswordHash,
          mustChangePassword: previousMustChangePassword,
        })
        .where(eq(users.id, user.id));
    }

    return { success: true };
  } catch {
    return { success: true };
  }
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
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, user.id));

  return { success: true };
}

export async function completeForcedPasswordReset(input: {
  newPassword: string;
  confirmPassword: string;
}): Promise<ActionResult> {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (!email) return { success: false, error: 'Not authenticated.' };

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = existing[0];

  if (!user?.passwordHash) return { success: false, error: 'Password not set.' };
  if (!user.mustChangePassword) {
    return { success: false, error: 'Password change is not required for this account.' };
  }

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
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, user.id));

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
