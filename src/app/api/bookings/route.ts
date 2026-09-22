import { resolveBookingsApiAccess } from '@/lib/api-auth';
import {
  createEventForAccess,
  listEventsForAccess,
  type AddEventInput,
} from '@/lib/events-service';
import { BUILDINGS, EVENT_TYPES, WARDS, type Building, type EventType, type Ward } from '@/schema/schema';
import { NextResponse } from 'next/server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCreateBody(body: unknown): { ok: true; input: AddEventInput } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: 'Invalid JSON body.' };
  }

  const missing: string[] = [];
  const requireString = (key: string) => {
    const value = body[key];
    if (typeof value !== 'string' || !value.trim()) {
      missing.push(key);
      return '';
    }
    return value.trim();
  };

  const building = requireString('building');
  const ward = requireString('ward');
  const name = requireString('name');
  const eventDate = requireString('eventDate');
  const startTime = requireString('startTime');
  const endTime = requireString('endTime');
  const email = requireString('email');
  const phone = requireString('phone');
  const description = requireString('description');
  const eventTypeRaw = requireString('eventType');

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing or empty required field(s): ${missing.join(', ')}.`,
    };
  }

  if (!BUILDINGS.includes(building as Building)) {
    return {
      ok: false,
      error: `Invalid building. Expected one of: ${BUILDINGS.join(', ')}.`,
    };
  }
  if (!WARDS.includes(ward as Ward)) {
    return {
      ok: false,
      error: `Invalid ward. Expected one of: ${WARDS.join(', ')}.`,
    };
  }
  if (!EVENT_TYPES.includes(eventTypeRaw as EventType)) {
    return {
      ok: false,
      error: `Invalid eventType. Expected one of: ${EVENT_TYPES.join(', ')}.`,
    };
  }

  return {
    ok: true,
    input: {
      building: building as Building,
      ward: ward as Ward,
      eventType: eventTypeRaw as EventType,
      name,
      eventDate,
      startTime,
      endTime,
      email,
      phone,
      description,
    },
  };
}

export async function POST(request: Request) {
  const authResult = await resolveBookingsApiAccess(request);
  if (!authResult.ok) return authResult.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseCreateBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await createEventForAccess(authResult.access, parsed.input, {
    requireEmailAndPhone: true,
  });

  if (!result.success) {
    const status = result.error?.toLowerCase().includes('only create') ? 403 : 400;
    return NextResponse.json({ error: result.error ?? 'Failed to create booking.' }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      booking: result.data,
      meta: result.meta,
    },
    { status: 201 }
  );
}

export async function GET(request: Request) {
  const authResult = await resolveBookingsApiAccess(request);
  if (!authResult.ok) return authResult.response;

  const url = new URL(request.url);
  const building = url.searchParams.get('building')?.trim() ?? '';
  const ward = url.searchParams.get('ward')?.trim() || undefined;
  const dateFrom = url.searchParams.get('dateFrom')?.trim() || undefined;
  const dateTo = url.searchParams.get('dateTo')?.trim() || undefined;
  const eventId =
    url.searchParams.get('eventId')?.trim() ||
    url.searchParams.get('id')?.trim() ||
    undefined;

  if (!building) {
    return NextResponse.json(
      { error: 'Query param "building" is required.' },
      { status: 400 }
    );
  }

  if (!BUILDINGS.includes(building as Building)) {
    return NextResponse.json(
      { error: `Invalid building. Expected one of: ${BUILDINGS.join(', ')}.` },
      { status: 400 }
    );
  }

  if (ward && !WARDS.includes(ward as Ward)) {
    return NextResponse.json(
      { error: `Invalid ward. Expected one of: ${WARDS.join(', ')}.` },
      { status: 400 }
    );
  }

  const result = await listEventsForAccess(authResult.access, {
    building: building as Building,
    ward: ward as Ward | undefined,
    dateFrom,
    dateTo,
    eventId,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Failed to list bookings.' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    bookings: result.data ?? [],
  });
}
