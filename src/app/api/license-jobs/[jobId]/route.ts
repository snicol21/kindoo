import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kindooLicenseJobs } from '@/schema/schema';

function getWorkerPollIntervalMs() {
  const parsed = Number.parseInt(process.env.KINDOO_WORKER_INTERVAL_MS ?? '60000', 10);
  if (!Number.isFinite(parsed)) return 60000;
  return Math.max(parsed, 5000);
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const workerPollIntervalMs = getWorkerPollIntervalMs();
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
      eventId: kindooLicenseJobs.eventId,
      requestedByUserId: kindooLicenseJobs.requestedByUserId,
      status: kindooLicenseJobs.status,
      attempts: kindooLicenseJobs.attempts,
      lastError: kindooLicenseJobs.lastError,
      completionType: kindooLicenseJobs.completionType,
      statusDetails: kindooLicenseJobs.statusDetails,
      durationMs: kindooLicenseJobs.durationMs,
      sessionReused: kindooLicenseJobs.sessionReused,
      claimedAt: kindooLicenseJobs.claimedAt,
      completedAt: kindooLicenseJobs.completedAt,
      updatedAt: kindooLicenseJobs.updatedAt,
      createdAt: kindooLicenseJobs.createdAt,
    })
    .from(kindooLicenseJobs)
    .where(eq(kindooLicenseJobs.id, jobId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  }

  const sessionRole = sessionUser?.role ?? 'ward_user';
  const canAccessJob = sessionRole !== 'ward_user' || job.requestedByUserId === userId;
  if (!canAccessJob) {
    return NextResponse.json({ error: 'Not authorized for this job.' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, job, workerPollIntervalMs });
}
