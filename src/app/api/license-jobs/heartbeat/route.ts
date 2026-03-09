import { NextResponse } from 'next/server';
import { recordWorkerHeartbeat } from '@/lib/license-worker-health';

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

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const workerId = request.headers.get('x-worker-id')?.trim() || 'local-worker';
  const host = typeof body.host === 'string' ? body.host.trim() : undefined;
  const mode = typeof body.mode === 'string' ? body.mode.trim() : undefined;

  await recordWorkerHeartbeat({ workerId, host, mode });

  return NextResponse.json({ ok: true, workerId, recordedAt: new Date().toISOString() });
}
