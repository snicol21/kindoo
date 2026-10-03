import { resolveBookingsApiAccess } from '@/lib/api-auth';
import { deleteEventForAccess } from '@/lib/events-service';
import { NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const authResult = await resolveBookingsApiAccess(request);
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  const eventId = id?.trim();
  if (!eventId) {
    return NextResponse.json({ error: 'Booking id is required.' }, { status: 400 });
  }

  const result = await deleteEventForAccess(authResult.access, eventId);
  if (!result.success) {
    const message = result.error ?? 'Failed to delete booking.';
    const status = message.toLowerCase().includes('not found') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
