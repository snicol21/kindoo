import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { publishLicenseJobEvent } from '@/lib/license-job-events';
import { contacts, events, kindooLicenseJobs } from '@/schema/schema';

const DEFAULT_TIMEZONE = 'America/Denver';
const EARLIEST_MINUTES = 5 * 60;
const LATEST_MINUTES = 23 * 60;

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

function parseTimeToMinutes(time: string) {
  const parts = time.split(':');
  if (parts.length !== 2) return null;
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function getAccessRule(building: string) {
  if (building === 'Stake Center') return 'STAKE CENTER - LIMITED';
  if (building === 'Maples Building') return 'MAPLES BUILDING - LIMITED';
  return null;
}

function buildDescription(contactWard: string | null, contactName: string | null) {
  return `[${contactWard ?? ''}] - [Private Event] - [${contactName ?? ''}]`;
}

function isDueForQueue(eventDate: string, startTime: string, endTime: string, now: Date) {
  const start = new Date(`${eventDate}T${startTime}:00`);
  const end = new Date(`${eventDate}T${endTime}:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;

  const dueAt = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  return now >= dueAt && now <= end;
}

function getLicenseWindow(eventDate: string, startTime: string, endTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return null;

  const windowStart = Math.max(EARLIEST_MINUTES, startMinutes - 120);
  const windowEnd = Math.min(LATEST_MINUTES, endMinutes + 120);

  return {
    startDate: eventDate,
    startTime: minutesToTime(windowStart),
    endDate: eventDate,
    endTime: minutesToTime(windowEnd),
  };
}

export async function POST(request: Request) {
  const authResult = assertWorkerAuthorized(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const now = new Date();

  const candidates = await db
    .select({
      eventId: events.id,
      requestedByUserId: events.userId,
      building: events.building,
      eventDate: events.eventDate,
      startTime: events.startTime,
      endTime: events.endTime,
      contactName: contacts.name,
      contactWard: contacts.ward,
      contactEmail: contacts.email,
    })
    .from(events)
    .innerJoin(contacts, eq(events.contactId, contacts.id))
    .where(eq(events.kindooLicenseCreated, false));

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, count: 0, queued: [] });
  }

  const eventIds = candidates.map((candidate) => candidate.eventId);
  const existingJobs = await db
    .select({ eventId: kindooLicenseJobs.eventId })
    .from(kindooLicenseJobs)
    .where(inArray(kindooLicenseJobs.eventId, eventIds));

  const hasExistingJob = new Set(existingJobs.map((job) => job.eventId));

  const dueRows = candidates.filter((candidate) => {
    if (hasExistingJob.has(candidate.eventId)) return false;
    if (!candidate.contactEmail || candidate.contactEmail.trim().length === 0) return false;
    if (!getAccessRule(candidate.building)) return false;
    return isDueForQueue(candidate.eventDate, candidate.startTime, candidate.endTime, now);
  });

  if (dueRows.length === 0) {
    return NextResponse.json({ ok: true, count: 0, queued: [] });
  }

  const insertValues = dueRows
    .map((row) => {
      const accessRule = getAccessRule(row.building);
      const window = getLicenseWindow(row.eventDate, row.startTime, row.endTime);
      if (!accessRule || !window) return null;

      return {
        eventId: row.eventId,
        requestedByUserId: row.requestedByUserId,
        status: 'queued' as const,
        email: row.contactEmail!.trim(),
        description: buildDescription(row.contactWard, row.contactName),
        timezone: DEFAULT_TIMEZONE,
        startDate: window.startDate,
        startTime: window.startTime,
        endDate: window.endDate,
        endTime: window.endTime,
        kindooAccessRule: accessRule,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  if (insertValues.length === 0) {
    return NextResponse.json({ ok: true, count: 0, queued: [] });
  }

  const queued = await db.insert(kindooLicenseJobs).values(insertValues).returning({
    id: kindooLicenseJobs.id,
    eventId: kindooLicenseJobs.eventId,
    requestedByUserId: kindooLicenseJobs.requestedByUserId,
  });

  for (const job of queued) {
    publishLicenseJobEvent({
      type: 'license-job-updated',
      userId: job.requestedByUserId,
      jobId: job.id,
      eventId: job.eventId,
      status: 'queued',
      completionType: null,
    });
  }

  return NextResponse.json({ ok: true, count: queued.length, queued });
}
