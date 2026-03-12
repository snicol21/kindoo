import { db } from '@/lib/db';
import { publishLicenseJobEvent } from '@/lib/license-job-events';
import { kindooLicenseJobs } from '@/schema/schema';
import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

const DEFAULT_CLAIM_LIMIT = 3;
const MAX_CLAIM_LIMIT = 20;
const DEFAULT_STALE_MINUTES = 60;

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

export async function POST(request: Request) {
  const authResult = assertWorkerAuthorized(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const workerId = request.headers.get('x-worker-id')?.trim() || 'local-worker';

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const requestedLimit = Number.parseInt(String(body.limit ?? DEFAULT_CLAIM_LIMIT), 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_CLAIM_LIMIT)
    : DEFAULT_CLAIM_LIMIT;

  const staleMinutesRaw = Number.parseInt(
    process.env.KINDOO_WORKER_STALE_MINUTES ?? `${DEFAULT_STALE_MINUTES}`,
    10
  );
  const staleMinutes = Number.isFinite(staleMinutesRaw)
    ? Math.max(staleMinutesRaw, 1)
    : DEFAULT_STALE_MINUTES;

  const nowDate = new Date();
  const staleThresholdDate = new Date(Date.now() - staleMinutes * 60 * 1000);

  // Recover stale processing jobs in case the local worker crashed mid-run.
  await db
    .update(kindooLicenseJobs)
    .set({
      status: 'queued',
      workerId: null,
      claimedAt: null,
      updatedAt: nowDate,
      lastError: 'Recovered from stale processing lock.',
      completionType: null,
      statusDetails: null,
      runLog: null,
      durationMs: null,
      sessionReused: null,
    })
    .where(
      and(
        eq(kindooLicenseJobs.status, 'processing'),
        lt(kindooLicenseJobs.claimedAt, staleThresholdDate)
      )
    );

  const candidates = await db
    .select({ id: kindooLicenseJobs.id })
    .from(kindooLicenseJobs)
    .where(eq(kindooLicenseJobs.status, 'queued'))
    .orderBy(asc(kindooLicenseJobs.createdAt))
    .limit(limit);

  const claimedJobs: Array<{
    id: string;
    eventId: string;
    requestedByUserId: string;
    payload: {
      eventId: string;
      email: string;
      description: string;
      timezone: string;
      startDate: string;
      startTime: string;
      endDate: string;
      endTime: string;
      kindooAccessRule?: string;
    };
    attempts: number;
  }> = [];

  for (const candidate of candidates) {
    const [claimed] = await db
      .update(kindooLicenseJobs)
      .set({
        status: 'processing',
        workerId,
        claimedAt: nowDate,
        updatedAt: nowDate,
        attempts: sql`${kindooLicenseJobs.attempts} + 1`,
        completionType: null,
        statusDetails: null,
        runLog: null,
        durationMs: null,
        sessionReused: null,
      })
      .where(and(eq(kindooLicenseJobs.id, candidate.id), eq(kindooLicenseJobs.status, 'queued')))
      .returning({
        id: kindooLicenseJobs.id,
        eventId: kindooLicenseJobs.eventId,
        requestedByUserId: kindooLicenseJobs.requestedByUserId,
        email: kindooLicenseJobs.email,
        description: kindooLicenseJobs.description,
        timezone: kindooLicenseJobs.timezone,
        startDate: kindooLicenseJobs.startDate,
        startTime: kindooLicenseJobs.startTime,
        endDate: kindooLicenseJobs.endDate,
        endTime: kindooLicenseJobs.endTime,
        kindooAccessRule: kindooLicenseJobs.kindooAccessRule,
        attempts: kindooLicenseJobs.attempts,
      });

    if (!claimed) {
      continue;
    }

    claimedJobs.push({
      id: claimed.id,
      eventId: claimed.eventId,
      requestedByUserId: claimed.requestedByUserId,
      payload: {
        eventId: claimed.eventId,
        email: claimed.email,
        description: claimed.description,
        timezone: claimed.timezone,
        startDate: claimed.startDate,
        startTime: claimed.startTime,
        endDate: claimed.endDate,
        endTime: claimed.endTime,
        ...(claimed.kindooAccessRule ? { kindooAccessRule: claimed.kindooAccessRule } : {}),
      },
      attempts: claimed.attempts,
    });

    publishLicenseJobEvent({
      type: 'license-job-updated',
      userId: claimed.requestedByUserId,
      jobId: claimed.id,
      eventId: claimed.eventId,
      status: 'processing',
      completionType: null,
    });
  }

  return NextResponse.json({ ok: true, workerId, count: claimedJobs.length, jobs: claimedJobs });
}
