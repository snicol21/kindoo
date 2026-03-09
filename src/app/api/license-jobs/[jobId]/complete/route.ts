import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { db } from '@/lib/db';
import { publishLicenseJobEvent } from '@/lib/license-job-events';
import { events, kindooLicenseJobs } from '@/schema/schema';

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

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const authResult = assertWorkerAuthorized(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const completionTypeRaw = String(body.completionType ?? '').trim();
  const completionType =
    completionTypeRaw === 'temporary-license-created' ||
    completionTypeRaw === 'existing-active-license'
      ? completionTypeRaw
      : 'temporary-license-created';
  const statusDetails =
    String(body.statusDetails ?? '')
      .trim()
      .slice(0, 4000) || null;
  const durationMsRaw = Number(body.durationMs);
  const durationMs = Number.isFinite(durationMsRaw) && durationMsRaw >= 0 ? durationMsRaw : null;
  const sessionReused =
    typeof body.sessionReused === 'boolean'
      ? body.sessionReused
      : String(body.sessionReused).trim() === 'true';

  const nowDate = new Date();
  const { jobId } = await context.params;

  const [job] = await db
    .update(kindooLicenseJobs)
    .set({
      status: 'completed',
      completedAt: nowDate,
      updatedAt: nowDate,
      lastError: null,
      completionType,
      statusDetails,
      durationMs,
      sessionReused,
    })
    .where(and(eq(kindooLicenseJobs.id, jobId), eq(kindooLicenseJobs.status, 'processing')))
    .returning({
      id: kindooLicenseJobs.id,
      eventId: kindooLicenseJobs.eventId,
      requestedByUserId: kindooLicenseJobs.requestedByUserId,
      completionType: kindooLicenseJobs.completionType,
      statusDetails: kindooLicenseJobs.statusDetails,
      durationMs: kindooLicenseJobs.durationMs,
      sessionReused: kindooLicenseJobs.sessionReused,
    });

  if (!job) {
    return NextResponse.json({ error: 'Job not found or not processing.' }, { status: 404 });
  }

  const [eventRecord] = await db
    .update(events)
    .set({ kindooLicenseCreated: true })
    .where(eq(events.id, job.eventId))
    .returning({
      id: events.id,
      userId: events.userId,
      building: events.building,
    });

  if (eventRecord) {
    revalidateTag(`events-${eventRecord.userId}`, 'max');
    revalidateTag(`events-${eventRecord.userId}-${eventRecord.building}`, 'max');
  }

  publishLicenseJobEvent({
    type: 'license-job-updated',
    userId: job.requestedByUserId,
    jobId: job.id,
    eventId: job.eventId,
    status: 'completed',
    completionType: job.completionType,
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    eventId: job.eventId,
    completionType: job.completionType,
    statusDetails: job.statusDetails,
    durationMs: job.durationMs,
    sessionReused: job.sessionReused,
  });
}
