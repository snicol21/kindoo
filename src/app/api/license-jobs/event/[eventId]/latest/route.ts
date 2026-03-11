import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { events, kindooLicenseJobs } from '@/schema/schema';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const session = await auth();
  const sessionUser = session?.user;
  const userId = sessionUser?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { eventId } = await context.params;

  const [eventRecord] = await db
    .select({
      id: events.id,
      userId: events.userId,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!eventRecord) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const sessionRole = sessionUser?.role ?? 'ward_user';
  const canAccess = sessionRole !== 'ward_user' || eventRecord.userId === userId;
  if (!canAccess) {
    return NextResponse.json({ error: 'Not authorized for this event.' }, { status: 403 });
  }

  const [job] = await db
    .select({
      id: kindooLicenseJobs.id,
      status: kindooLicenseJobs.status,
      attempts: kindooLicenseJobs.attempts,
      completionType: kindooLicenseJobs.completionType,
      statusDetails: kindooLicenseJobs.statusDetails,
      durationMs: kindooLicenseJobs.durationMs,
      sessionReused: kindooLicenseJobs.sessionReused,
      lastError: kindooLicenseJobs.lastError,
      claimedAt: kindooLicenseJobs.claimedAt,
      completedAt: kindooLicenseJobs.completedAt,
      createdAt: kindooLicenseJobs.createdAt,
      updatedAt: kindooLicenseJobs.updatedAt,
    })
    .from(kindooLicenseJobs)
    .where(
      and(
        eq(kindooLicenseJobs.eventId, eventId),
        eq(kindooLicenseJobs.requestedByUserId, eventRecord.userId)
      )
    )
    .orderBy(desc(kindooLicenseJobs.createdAt))
    .limit(1);

  if (!job) {
    return NextResponse.json({ ok: true, job: null });
  }

  return NextResponse.json({ ok: true, job });
}
