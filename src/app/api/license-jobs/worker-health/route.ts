import { auth } from '@/lib/auth';
import { getEffectiveWorkerPollIntervalMs, getWorkerHealth } from '@/lib/license-worker-health';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const workerPollIntervalMs = await getEffectiveWorkerPollIntervalMs();
  const health = await getWorkerHealth();

  return NextResponse.json({
    ok: true,
    workerPollIntervalMs,
    health,
  });
}
