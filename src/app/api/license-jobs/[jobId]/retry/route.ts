import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { publishLicenseJobEvent } from '@/lib/license-job-events';
import { kindooLicenseJobs } from '@/schema/schema';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

export async function POST(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const session = await auth();
  const sessionUser = session?.user;
  const userId = sessionUser?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { jobId } = await context.params;

  const [job] = await db
    .select({
      id: kindooLicenseJobs.id,
      requestedByUserId: kindooLicenseJobs.requestedByUserId,
      status: kindooLicenseJobs.status,
    })
    .from(kindooLicenseJobs)
    .where(eq(kindooLicenseJobs.id, jobId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const sessionRole = sessionUser?.role ?? 'ward_user';
  const canRetryJob = sessionRole !== 'ward_user' || job.requestedByUserId === userId;
  if (!canRetryJob) {
    return NextResponse.json({ error: 'Not authorized for this job.' }, { status: 403 });
  }

  if (job.status !== 'failed') {
    return NextResponse.json({ error: 'Only failed jobs can be retried.' }, { status: 400 });
  }

  const nowDate = new Date();
  const [updated] = await db
    .update(kindooLicenseJobs)
    .set({
      status: 'queued',
      workerId: null,
      claimedAt: null,
      completedAt: null,
      lastError: null,
      completionType: null,
      statusDetails: null,
      durationMs: null,
      sessionReused: null,
      updatedAt: nowDate,
    })
    .where(and(eq(kindooLicenseJobs.id, jobId), eq(kindooLicenseJobs.status, 'failed')))
    .returning({
      id: kindooLicenseJobs.id,
      eventId: kindooLicenseJobs.eventId,
      requestedByUserId: kindooLicenseJobs.requestedByUserId,
      status: kindooLicenseJobs.status,
    });

  if (!updated) {
    return NextResponse.json({ error: 'Failed to retry job.' }, { status: 409 });
  }

  publishLicenseJobEvent({
    type: 'license-job-updated',
    userId: updated.requestedByUserId,
    jobId: updated.id,
    eventId: updated.eventId,
    status: 'queued',
    completionType: null,
  });

  return NextResponse.json({ ok: true, jobId: updated.id, status: updated.status });
}
