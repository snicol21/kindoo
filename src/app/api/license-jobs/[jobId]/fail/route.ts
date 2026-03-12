import { db } from '@/lib/db';
import { publishLicenseJobEvent } from '@/lib/license-job-events';
import { kindooLicenseJobs } from '@/schema/schema';
import { and, eq } from 'drizzle-orm';
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

  const { jobId } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const details = String(body.details ?? 'Automation failed.').slice(0, 4000);
  const runLog =
    String(body.runLog ?? '')
      .trim()
      .slice(0, 120000) || null;
  const nowDate = new Date();

  const [job] = await db
    .update(kindooLicenseJobs)
    .set({
      status: 'failed',
      lastError: details,
      completionType: null,
      statusDetails: null,
      runLog,
      durationMs: null,
      sessionReused: null,
      updatedAt: nowDate,
    })
    .where(and(eq(kindooLicenseJobs.id, jobId), eq(kindooLicenseJobs.status, 'processing')))
    .returning({
      id: kindooLicenseJobs.id,
      eventId: kindooLicenseJobs.eventId,
      requestedByUserId: kindooLicenseJobs.requestedByUserId,
      attempts: kindooLicenseJobs.attempts,
    });

  if (!job) {
    return NextResponse.json({ error: 'Job not found or not processing.' }, { status: 404 });
  }

  publishLicenseJobEvent({
    type: 'license-job-updated',
    userId: job.requestedByUserId,
    jobId: job.id,
    eventId: job.eventId,
    status: 'failed',
    completionType: null,
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    eventId: job.eventId,
    attempts: job.attempts,
  });
}
