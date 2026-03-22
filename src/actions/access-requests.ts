'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { sendNotificationEventSms } from '@/lib/notifications';
import { hashPassword } from '@/lib/password';
import { canAccessUserAdmin, canAssignRole, ROLE_LABELS } from '@/lib/permissions';
import { buildAccessRequestSubmittedSms } from '@/lib/sms-message-templates';
import {
  accessRequests,
  USER_ROLES,
  users,
  WARDS,
  type AccessRequestStatus,
  type UserRole,
  type Ward,
} from '@/schema/schema';
import { normalizePhoneForStorage } from '@/utils/phoneUtils';
import { and, desc, eq } from 'drizzle-orm';

const PASSWORD_MIN_LENGTH = 12;

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateTemporaryPassword(length = 14) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

async function requireUserAdmin() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return { ok: false, error: 'Not authorized.' } as const;
  }

  const [dbUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (!dbUser || !canAccessUserAdmin((dbUser.role ?? 'ward_user') as UserRole)) {
    return { ok: false, error: 'Not authorized.' } as const;
  }

  return {
    ok: true,
    userId: dbUser.id,
    role: (dbUser.role ?? 'ward_user') as UserRole,
    ward: dbUser.ward,
  } as const;
}

function canReviewRequest(args: { actorRole: UserRole; actorWard: Ward; requestWard: Ward }) {
  if (args.actorRole === 'admin' || args.actorRole === 'stake_manager') return true;
  if (args.actorRole === 'ward_manager') return args.actorWard === args.requestWard;
  return false;
}

function normalizeRequestedRole(role: string | null): UserRole | undefined {
  if (!role) return undefined;
  const candidate = role as UserRole;
  return USER_ROLES.includes(candidate) ? candidate : undefined;
}

export async function submitAccessRequest(input: {
  email: string;
  name: string;
  phone: string;
  ward: Ward;
  comments?: string;
}): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = normalizePhoneForStorage(input.phone);
  const ward = input.ward;
  const comments = input.comments?.trim() || null;

  if (!isValidEmail(email)) return { success: false, error: 'Valid email is required.' };
  if (!name) return { success: false, error: 'Name is required.' };
  if (!phone || !/^[\d\s\-+().]{7,20}$/.test(phone)) {
    return { success: false, error: 'Valid phone number is required.' };
  }
  if (!WARDS.includes(ward)) return { success: false, error: 'Ward is required.' };
  if (comments && comments.length > 1000) {
    return { success: false, error: 'Comments must be 1000 characters or less.' };
  }

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    // Return a generic success response to avoid revealing whether an account exists.
    return { success: true };
  }

  const [existingPending] = await db
    .select()
    .from(accessRequests)
    .where(and(eq(accessRequests.email, email), eq(accessRequests.status, 'pending')))
    .limit(1);

  if (existingPending) {
    // Return a generic success response to avoid revealing request/account state.
    return { success: true };
  }

  await db.insert(accessRequests).values({
    email,
    name,
    phone,
    ward,
    comments,
    status: 'pending',
  });

  try {
    const potentialReviewers = await db
      .select({
        id: users.id,
        role: users.role,
        ward: users.ward,
      })
      .from(users);

    const recipientUserIds = potentialReviewers
      .filter((candidate) =>
        canReviewRequest({
          actorRole: (candidate.role ?? 'ward_user') as UserRole,
          actorWard: candidate.ward,
          requestWard: ward,
        })
      )
      .map((candidate) => candidate.id);

    if (recipientUserIds.length > 0) {
      await sendNotificationEventSms({
        eventKey: 'access_request_submitted',
        recipientUserIds,
        message: buildAccessRequestSubmittedSms({
          name,
          ward,
        }),
      });
    }
  } catch (error) {
    console.error('[submitAccessRequest] Failed to send SMS notifications:', error);
  }

  return { success: true };
}

export async function listAccessRequests(): Promise<
  ActionResult<
    {
      id: string;
      email: string;
      name: string;
      phone: string;
      ward: Ward;
      comments: string | null;
      requestedRole: UserRole | null;
      status: AccessRequestStatus;
      createdAt: Date;
      reviewedAt: Date | null;
      reviewedByName: string | null;
      reviewedByEmail: string | null;
      reviewNote: string | null;
    }[]
  >
> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const all = await db
    .select({
      id: accessRequests.id,
      email: accessRequests.email,
      name: accessRequests.name,
      phone: accessRequests.phone,
      ward: accessRequests.ward,
      comments: accessRequests.comments,
      requestedRole: accessRequests.requestedRole,
      status: accessRequests.status,
      createdAt: accessRequests.createdAt,
      reviewedAt: accessRequests.reviewedAt,
      reviewNote: accessRequests.reviewNote,
      reviewedByName: users.name,
      reviewedByEmail: users.email,
    })
    .from(accessRequests)
    .leftJoin(users, eq(accessRequests.reviewedByUserId, users.id))
    .orderBy(desc(accessRequests.createdAt), desc(accessRequests.updatedAt));

  const visible = all.filter((request) =>
    canReviewRequest({
      actorRole: admin.role,
      actorWard: admin.ward,
      requestWard: request.ward,
    })
  );

  return {
    success: true,
    data: visible.map((request) => ({
      id: request.id,
      email: request.email,
      name: request.name,
      phone: request.phone,
      ward: request.ward,
      comments: request.comments ?? null,
      requestedRole: request.requestedRole ?? null,
      status: request.status,
      createdAt: request.createdAt,
      reviewedAt: request.reviewedAt ?? null,
      reviewedByName: request.reviewedByName ?? null,
      reviewedByEmail: request.reviewedByEmail ?? null,
      reviewNote: request.reviewNote ?? null,
    })),
  };
}

export async function getPendingAccessRequestCount(): Promise<ActionResult<{ count: number }>> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const pending = await db
    .select({ id: accessRequests.id, ward: accessRequests.ward })
    .from(accessRequests)
    .where(eq(accessRequests.status, 'pending'));

  const count = pending.filter((request) =>
    canReviewRequest({
      actorRole: admin.role,
      actorWard: admin.ward,
      requestWard: request.ward,
    })
  ).length;

  return { success: true, data: { count } };
}

export async function approveAccessRequest(input: {
  requestId: string;
  role?: UserRole;
  note?: string;
}): Promise<ActionResult<{ emailWarning?: string }>> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const requestId = input.requestId.trim();
  const roleInput = normalizeRequestedRole(input.role ?? null) ?? 'ward_user';
  const note = input.note?.trim() || null;

  if (!requestId) return { success: false, error: 'Invalid request id.' };

  const [request] = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, requestId))
    .limit(1);
  if (!request) return { success: false, error: 'Request not found.' };
  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been reviewed.' };
  }

  if (
    !canReviewRequest({
      actorRole: admin.role,
      actorWard: admin.ward,
      requestWard: request.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to approve this request.' };
  }

  if (!canAssignRole(admin.role, roleInput)) {
    return { success: false, error: 'You are not allowed to assign that role.' };
  }

  if (admin.role === 'ward_manager' && request.ward !== admin.ward) {
    return { success: false, error: 'You can only approve requests in your ward.' };
  }

  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, request.email))
    .limit(1);

  let temporaryPassword: string | null = null;
  if (!existingUser) {
    temporaryPassword = generateTemporaryPassword();
    if (temporaryPassword.length < PASSWORD_MIN_LENGTH) {
      return { success: false, error: 'Failed to generate temporary password.' };
    }
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    if (existingUser) {
      await tx
        .update(users)
        .set({
          name: request.name,
          phone: request.phone,
          ward: request.ward,
          role: roleInput,
        })
        .where(eq(users.id, existingUser.id));
    } else {
      const passwordHash = await hashPassword(temporaryPassword as string);
      await tx.insert(users).values({
        email: request.email,
        name: request.name,
        phone: request.phone,
        ward: request.ward,
        role: roleInput,
        passwordHash,
        mustChangePassword: true,
      });
    }

    await tx
      .update(accessRequests)
      .set({
        status: 'approved',
        reviewedAt: now,
        reviewedByUserId: admin.userId,
        reviewNote: note,
        requestedRole: roleInput,
        updatedAt: now,
      })
      .where(eq(accessRequests.id, request.id));
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const grantedRoleLabel = ROLE_LABELS[roleInput] ?? roleInput;
  const includeWardInEmail = roleInput === 'ward_manager' || roleInput === 'ward_user';
  const wardTextLine = includeWardInEmail ? `Ward: ${request.ward}\n` : '';
  const wardHtmlLine = includeWardInEmail
    ? `<tr><td style="padding: 4px 0;"><strong>Ward:</strong> ${request.ward}</td></tr>`
    : '';
  const isNewUser = !existingUser;
  const passwordTextLine = isNewUser ? `Temporary password: ${temporaryPassword}\n` : '';
  const passwordHtmlLine = isNewUser
    ? `<tr><td style="padding: 4px 0;"><strong>Temporary password:</strong> ${temporaryPassword}</td></tr>`
    : '';
  const postApprovalText = isNewUser
    ? 'For security, you must change this password immediately after your first sign in.'
    : 'Your existing password was not changed.';
  const postApprovalHtml = isNewUser
    ? 'For security, you must change this temporary password immediately after your first sign in.'
    : 'Your existing password was not changed.';
  const logoUrl = `${appUrl}/icons/favicon-96x96.png`;
  const emailResult = await sendEmail({
    to: request.email,
    subject: 'Your DigitalFob access request has been approved',
    text: `Hello ${request.name},\n\nYour access request has been approved.\n\nRole granted: ${grantedRoleLabel}\n${wardTextLine}\nSign in here: ${appUrl}/auth/signin\nEmail: ${request.email}\n${passwordTextLine}\n${postApprovalText}\n`,
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
              <h2 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0f172a;">Access request approved</h2>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">Hello ${request.name}, your access request has been approved. Here are your account details:</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;line-height:1.6;color:#0f172a;">
                <tr><td style="padding: 4px 0;"><strong>Role granted:</strong> ${grantedRoleLabel}</td></tr>
                ${wardHtmlLine}
                <tr><td style="padding: 4px 0;"><strong>Email:</strong> ${request.email}</td></tr>
                ${passwordHtmlLine}
              </table>

              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">
                <a href="${appUrl}/auth/signin" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Sign in</a>
              </p>

              <p style="margin:0;font-size:13px;line-height:1.6;color:#475569;">${postApprovalHtml}</p>
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

export async function denyAccessRequest(input: {
  requestId: string;
  note?: string;
}): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (!admin.ok) return { success: false, error: admin.error };

  const requestId = input.requestId.trim();
  const note = input.note?.trim() || null;

  if (!requestId) return { success: false, error: 'Invalid request id.' };

  const [request] = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, requestId))
    .limit(1);
  if (!request) return { success: false, error: 'Request not found.' };
  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been reviewed.' };
  }

  if (
    !canReviewRequest({
      actorRole: admin.role,
      actorWard: admin.ward,
      requestWard: request.ward,
    })
  ) {
    return { success: false, error: 'You are not allowed to deny this request.' };
  }

  const now = new Date();
  await db
    .update(accessRequests)
    .set({
      status: 'denied',
      reviewedAt: now,
      reviewedByUserId: admin.userId,
      reviewNote: note,
      updatedAt: now,
    })
    .where(eq(accessRequests.id, request.id));

  return { success: true };
}
