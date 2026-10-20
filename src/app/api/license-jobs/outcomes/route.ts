import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { events, kindooLicenseJobs } from '@/schema/schema';
import { desc, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

const MAX_EVENT_IDS = 200;

type JobOutcome = {
  status: string;
  completionType: string | null;
};

// Batched version of GET /api/license-jobs/event/[eventId]/latest.
// Same auth: signed-in users only; ward_user may only read their own events.
export async function POST(request: Request) {
  const session = await auth();
  const sessionUser = session?.user;
  const userId = sessionUser?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { eventIds?: unknown } | null;
  const rawIds = Array.isArray(body?.eventIds) ? body.eventIds : null;
  if (!rawIds) {
    return NextResponse.json({ error: 'eventIds must be an array.' }, { status: 400 });
  }

  const eventIds = [
    ...new Set(rawIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  ];
  if (eventIds.length > MAX_EVENT_IDS) {
    return NextResponse.json(
      { error: `At most ${MAX_EVENT_IDS} eventIds per request.` },
      { status: 400 }
    );
  }
  if (eventIds.length === 0) {
    return NextResponse.json({ ok: true, jobs: {} });
  }

  const sessionRole = sessionUser?.role ?? 'ward_user';

  const eventRecords = await db
    .select({ id: events.id, userId: events.userId })
    .from(events)
    .where(inArray(events.id, eventIds));

  const ownerByEvent = new Map<string, string>();
  for (const record of eventRecords) {
    const canAccess = sessionRole !== 'ward_user' || record.userId === userId;
    if (canAccess) ownerByEvent.set(record.id, record.userId);
  }

  const jobs: Record<string, JobOutcome | null> = {};
  const accessibleIds = [...ownerByEvent.keys()];
  for (const id of accessibleIds) jobs[id] = null;

  if (accessibleIds.length > 0) {
    const jobRows = await db
      .select({
        eventId: kindooLicenseJobs.eventId,
        requestedByUserId: kindooLicenseJobs.requestedByUserId,
        status: kindooLicenseJobs.status,
        completionType: kindooLicenseJobs.completionType,
      })
      .from(kindooLicenseJobs)
      .where(inArray(kindooLicenseJobs.eventId, accessibleIds))
      .orderBy(desc(kindooLicenseJobs.createdAt));

    for (const row of jobRows) {
      if (jobs[row.eventId]) continue; // rows are newest first
      if (ownerByEvent.get(row.eventId) !== row.requestedByUserId) continue;
      jobs[row.eventId] = { status: row.status, completionType: row.completionType ?? null };
    }
  }

  return NextResponse.json({ ok: true, jobs });
}
