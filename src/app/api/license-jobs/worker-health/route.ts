import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getWorkerHealth } from '@/lib/license-worker-health';

function getWorkerPollIntervalMs() {
  const parsed = Number.parseInt(process.env.KINDOO_WORKER_INTERVAL_MS ?? '60000', 10);
  if (!Number.isFinite(parsed)) return 60000;
  return Math.max(parsed, 5000);
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const workerPollIntervalMs = getWorkerPollIntervalMs();
  const health = await getWorkerHealth(workerPollIntervalMs);

  return NextResponse.json({
    ok: true,
    workerPollIntervalMs,
    health,
  });
}
