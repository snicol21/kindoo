import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { publishLicenseJobEvent } from '@/lib/license-job-events';
import { events, kindooLicenseJobs } from '@/schema/schema';
import { and, eq, inArray } from 'drizzle-orm';

type LicensePayload = {
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

function getWorkerPollIntervalMs() {
  const parsed = Number.parseInt(process.env.KINDOO_WORKER_INTERVAL_MS ?? '60000', 10);
  if (!Number.isFinite(parsed)) return 60000;
  return Math.max(parsed, 5000);
}

function validatePayload(payload: Record<string, unknown>) {
  const required = [
    'eventId',
    'email',
    'description',
    'timezone',
    'startDate',
    'startTime',
    'endDate',
    'endTime',
  ];

  for (const key of required) {
    if (!payload[key] || typeof payload[key] !== 'string') {
      return `Missing or invalid field: ${key}`;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate as string)) {
    return 'startDate must be YYYY-MM-DD.';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.endDate as string)) {
    return 'endDate must be YYYY-MM-DD.';
  }

  if (!/^\d{2}:\d{2}$/.test(payload.startTime as string)) {
    return 'startTime must be HH:mm.';
  }

  if (!/^\d{2}:\d{2}$/.test(payload.endTime as string)) {
    return 'endTime must be HH:mm.';
  }

  if (payload.kindooAccessRule !== undefined) {
    if (typeof payload.kindooAccessRule !== 'string') {
      return 'kindooAccessRule must be a string when provided.';
    }

    const allowed = new Set(['STAKE CENTER - LIMITED', 'MAPLES BUILDING - LIMITED']);
    if (!allowed.has(payload.kindooAccessRule.trim())) {
      return 'kindooAccessRule must be either "STAKE CENTER - LIMITED" or "MAPLES BUILDING - LIMITED".';
    }
  }

  return null;
}

function extractPayload(payload: Record<string, unknown>): LicensePayload {
  return {
    eventId: String(payload.eventId),
    email: String(payload.email),
    description: String(payload.description),
    timezone: String(payload.timezone),
    startDate: String(payload.startDate),
    startTime: String(payload.startTime),
    endDate: String(payload.endDate),
    endTime: String(payload.endTime),
    ...(payload.kindooAccessRule ? { kindooAccessRule: String(payload.kindooAccessRule) } : {}),
  };
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const workerPollIntervalMs = getWorkerPollIntervalMs();
  const session = await auth();
  const sessionUser = session?.user;
  const userId = sessionUser?.id ?? null;

  if (!userId) {
    console.warn('[license-jobs] unauthenticated request', { requestId });
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    console.warn('[license-jobs] invalid json body', { requestId, userId });
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    console.warn('[license-jobs] payload validation failed', {
      requestId,
      userId,
      validationError,
    });
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const normalizedPayload = extractPayload(payload);
  const [eventRecord] = await db
    .select({
      id: events.id,
      userId: events.userId,
      building: events.building,
    })
    .from(events)
    .where(eq(events.id, normalizedPayload.eventId))
    .limit(1);

  if (!eventRecord) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
  }

  const sessionRole = sessionUser?.role ?? 'ward_user';
  const canManageEvent = sessionRole !== 'ward_user' || eventRecord.userId === userId;
  if (!canManageEvent) {
    return NextResponse.json({ error: 'Not authorized for this event.' }, { status: 403 });
  }

  console.info('[license-jobs] forwarding request', {
    requestId,
    userId,
    eventId: normalizedPayload.eventId,
    email: normalizedPayload.email,
    startDate: normalizedPayload.startDate,
    startTime: normalizedPayload.startTime,
    endDate: normalizedPayload.endDate,
    endTime: normalizedPayload.endTime,
    kindooAccessRule: normalizedPayload.kindooAccessRule,
  });

  const [existing] = await db
    .select({ id: kindooLicenseJobs.id, status: kindooLicenseJobs.status })
    .from(kindooLicenseJobs)
    .where(
      and(
        eq(kindooLicenseJobs.eventId, normalizedPayload.eventId),
        inArray(kindooLicenseJobs.status, ['queued', 'processing'])
      )
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      {
        ok: true,
        mode: 'queue',
        status: existing.status,
        jobId: existing.id,
        requestId,
        workerPollIntervalMs,
        message: 'A queued license job already exists for this event.',
      },
      { status: 200 }
    );
  }

  const [job] = await db
    .insert(kindooLicenseJobs)
    .values({
      eventId: normalizedPayload.eventId,
      requestedByUserId: userId,
      status: 'queued',
      email: normalizedPayload.email,
      description: normalizedPayload.description,
      timezone: normalizedPayload.timezone,
      startDate: normalizedPayload.startDate,
      startTime: normalizedPayload.startTime,
      endDate: normalizedPayload.endDate,
      endTime: normalizedPayload.endTime,
      kindooAccessRule: normalizedPayload.kindooAccessRule ?? null,
    })
    .returning({ id: kindooLicenseJobs.id });

  publishLicenseJobEvent({
    type: 'license-job-updated',
    userId,
    jobId: job.id,
    eventId: normalizedPayload.eventId,
    status: 'queued',
    completionType: null,
  });

  return NextResponse.json(
    {
      ok: true,
      mode: 'queue',
      status: 'queued',
      jobId: job.id,
      requestId,
      workerPollIntervalMs,
      message: 'License request queued for local worker processing.',
    },
    { status: 202 }
  );
}
