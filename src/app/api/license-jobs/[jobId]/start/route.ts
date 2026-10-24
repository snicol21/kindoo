import { db } from '@/lib/db';
import { events, kindooLicenseJobs } from '@/schema/schema';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

function getWorkerTokenFromHeader(request: Request) {
  const headerValue = request.headers.get('x-worker-token')?.trim();
  return headerValue || null;
}

function assertWorkerAuthorized(request: Request) {
  const configuredToken = process.env.KINDOO_WORKER_TOKEN?.trim();
  if (!configuredToken) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Worker token is not configured.' }, { status: 500 }),
    };
  }

  const provided = getWorkerTokenFromHeader(request);
  if (!provided || provided !== configuredToken) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized worker.' }, { status: 401 }),
    };
  }

  return { ok: true as const };
}

/**
 * Pre-run check. The worker claims up to a few jobs per cycle and runs them one at a time, so a
 * claimed job can wait minutes before it starts. The worker calls this right before it runs a
 * job. If an admin marked the event as handled manually in the meantime, the job goes back to
 * queued (the claim query skips it while the event is marked, and reopening resumes it) and the
 * worker must not run it.
 */
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const authResult = assertWorkerAuthorized(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { jobId } = await context.params;

  const [job] = await db
    .select({
      id: kindooLicenseJobs.id,
      eventId: kindooLicenseJobs.eventId,
      status: kindooLicenseJobs.status,
      manualHandledAt: events.manualHandledAt,
    })
    .from(kindooLicenseJobs)
    .innerJoin(events, eq(kindooLicenseJobs.eventId, events.id))
    .where(eq(kindooLicenseJobs.id, jobId))
    .limit(1);

  if (!job) {
    return NextResponse.json({ ok: true, proceed: false, reason: 'not-found' });
  }

  if (job.status !== 'processing') {
    // Reset by stale recovery or already finished: another run owns it, do not run it again.
    return NextResponse.json({ ok: true, proceed: false, reason: 'not-processing' });
  }

  if (!job.manualHandledAt) {
    return NextResponse.json({ ok: true, proceed: true });
  }

  const nowDate = new Date();
  await db
    .update(kindooLicenseJobs)
    .set({
      status: 'queued',
      workerId: null,
      claimedAt: null,
      attempts: sql`max(${kindooLicenseJobs.attempts} - 1, 0)`,
      updatedAt: nowDate,
    })
    .where(and(eq(kindooLicenseJobs.id, job.id), eq(kindooLicenseJobs.status, 'processing')));

  return NextResponse.json({ ok: true, proceed: false, reason: 'handled-manually' });
}
