import { db } from '@/lib/db';
import { getLicenseWindow, isDueForQueue, SCHEDULE_TIMEZONE } from '@/lib/license-schedule';
import { formatWardLabel } from '@/lib/ward-utils';
import { contacts, events, kindooLicenseJobs, users } from '@/schema/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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

function getAccessRule(building: string) {
  if (building === 'Stake Center') return 'STAKE CENTER - LIMITED';
  if (building === 'Maples Building') return 'MAPLES BUILDING - LIMITED';
  return null;
}

function buildDescription(
  eventType: string | null,
  contactName: string | null,
  contactWard: string | null,
  creatorName: string | null,
  creatorRole: string | null
) {
  const formatCreatorRoleLabel = (role: string | null | undefined) => {
    switch (role?.trim()) {
      case 'admin':
      case 'stake_manager':
        return 'Stake Manager';
      case 'ward_manager':
        return 'Ward Manager';
      case 'ward_user':
        return 'Ward User';
      default:
        return 'Unknown';
    }
  };

  const normalizedEventType = eventType?.trim() || 'Private';
  const normalizedCreatorName = creatorName?.trim() || 'Unknown';
  const normalizedCreatorRole = formatCreatorRoleLabel(creatorRole);
  return `[${normalizedEventType} event] - for ${contactName ?? ''} (${contactWard ?? ''}) - granted by ${normalizedCreatorName} [${normalizedCreatorRole}]`;
}

export async function POST(request: Request) {
  const authResult = assertWorkerAuthorized(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const candidates = await db
    .select({
      eventId: events.id,
      requestedByUserId: events.userId,
      building: events.building,
      eventType: events.eventType,
      eventDate: events.eventDate,
      startTime: events.startTime,
      endTime: events.endTime,
      contactName: contacts.name,
      contactWard: contacts.ward,
      contactOtherWardName: contacts.otherWardName,
      contactEmail: contacts.email,
      creatorName: users.name,
      creatorRole: users.role,
    })
    .from(events)
    .innerJoin(contacts, eq(events.contactId, contacts.id))
    .innerJoin(users, eq(events.userId, users.id))
    // Events an admin marked as handled manually are never queued.
    .where(and(eq(events.kindooLicenseCreated, false), isNull(events.manualHandledAt)));

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
    return isDueForQueue(candidate.eventDate, candidate.startTime, candidate.endTime);
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
        description: buildDescription(
          row.eventType,
          row.contactName,
          row.contactWard ? formatWardLabel(row.contactWard, row.contactOtherWardName) : null,
          row.creatorName,
          row.creatorRole
        ),
        timezone: SCHEDULE_TIMEZONE,
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

  return NextResponse.json({ ok: true, count: queued.length, queued });
}
