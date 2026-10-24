import { db } from '@/lib/db';
import { resolveLicenseJobSmsRecipientIds } from '@/lib/license-job-recipients';
import { loadEventSmsDetails } from '@/lib/license-job-sms';
import { isEventHandledManually, logWorkerResultAfterOverride } from '@/lib/manual-override';
import { sendNotificationEventSms } from '@/lib/notifications';
import { buildLicenseJobCompletedSms } from '@/lib/sms-message-templates';
import { events, kindooLicenseJobs } from '@/schema/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
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
  const runLog =
    String(body.runLog ?? '')
      .trim()
      .slice(0, 120000) || null;
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
      runLog,
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
      runLog: kindooLicenseJobs.runLog,
      durationMs: kindooLicenseJobs.durationMs,
      sessionReused: kindooLicenseJobs.sessionReused,
    });

  if (!job) {
    return NextResponse.json({ error: 'Job not found or not processing.' }, { status: 404 });
  }

  // The job row above always records what the worker did. If an admin marked the event as
  // handled manually, the event flag stays untouched, no SMS goes out, and the late result is
  // logged. The condition is part of the UPDATE so a mark racing this request is honored.
  const [eventRecord] = await db
    .update(events)
    .set({ kindooLicenseCreated: true })
    .where(and(eq(events.id, job.eventId), isNull(events.manualHandledAt)))
    .returning({
      id: events.id,
      userId: events.userId,
      building: events.building,
    });

  if (eventRecord) {
    revalidateTag(`events-${eventRecord.userId}`, 'max');
    revalidateTag(`events-${eventRecord.userId}-${eventRecord.building}`, 'max');
  }

  const handledManually = !eventRecord && (await isEventHandledManually(job.eventId));
  if (handledManually) {
    await logWorkerResultAfterOverride(job.eventId, {
      jobId: job.id,
      outcome: 'completed',
      completionType: job.completionType,
    });
  } else {
    try {
      const eventDetails = await loadEventSmsDetails(job.eventId);
      if (!eventDetails) {
        throw new Error(`Event ${job.eventId} not found for SMS.`);
      }

      await sendNotificationEventSms({
        eventKey: 'license_job_completed',
        recipientUserIds: await resolveLicenseJobSmsRecipientIds(job.requestedByUserId),
        message: buildLicenseJobCompletedSms({ ...eventDetails }),
      });
    } catch (error) {
      console.error('[license-jobs.complete] Failed to send SMS notifications:', error);
    }
  }

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    eventId: job.eventId,
    completionType: job.completionType,
    statusDetails: job.statusDetails,
    runLog: job.runLog,
    durationMs: job.durationMs,
    sessionReused: job.sessionReused,
  });
}
