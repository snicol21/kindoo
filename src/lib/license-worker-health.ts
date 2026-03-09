import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { licenseWorkerHeartbeats } from '@/schema/schema';

export type LicenseWorkerHealthStatus = 'healthy' | 'stale' | 'down' | 'unknown';

export async function recordWorkerHeartbeat(input: {
  workerId: string;
  host?: string;
  mode?: string;
}) {
  const workerId = input.workerId.trim() || 'local-worker';
  const host = input.host?.trim() || null;
  const mode = input.mode?.trim() || null;

  await db
    .insert(licenseWorkerHeartbeats)
    .values({
      workerId,
      host,
      mode,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: licenseWorkerHeartbeats.workerId,
      set: {
        host,
        mode,
        lastSeenAt: new Date(),
      },
    });
}

async function getLatestWorkerHeartbeat() {
  const [latest] = await db
    .select({
      workerId: licenseWorkerHeartbeats.workerId,
      host: licenseWorkerHeartbeats.host,
      mode: licenseWorkerHeartbeats.mode,
      lastSeenAt: licenseWorkerHeartbeats.lastSeenAt,
    })
    .from(licenseWorkerHeartbeats)
    .orderBy(desc(licenseWorkerHeartbeats.lastSeenAt))
    .limit(1);

  return latest ?? null;
}

export async function getWorkerHealth(workerPollIntervalMs: number): Promise<{
  status: LicenseWorkerHealthStatus;
  workerId?: string;
  host?: string;
  mode?: string;
  lastSeenAt?: string;
  ageMs?: number;
}> {
  let latest = null;
  try {
    latest = await getLatestWorkerHeartbeat();
  } catch (error) {
    console.error('[license-worker-health] Failed to load heartbeat:', error);
    return { status: 'unknown' };
  }

  if (!latest) {
    return { status: 'unknown' };
  }

  const now = Date.now();
  const lastSeenAtMs =
    latest.lastSeenAt instanceof Date
      ? latest.lastSeenAt.getTime()
      : Number(latest.lastSeenAt ?? 0);
  const ageMs = Math.max(0, now - lastSeenAtMs);
  const healthyThresholdMs = Math.max(Math.round(workerPollIntervalMs * 1.5), 10_000);
  const staleThresholdMs = Math.max(Math.round(workerPollIntervalMs * 4), 30_000);

  const status: LicenseWorkerHealthStatus =
    ageMs <= healthyThresholdMs ? 'healthy' : ageMs <= staleThresholdMs ? 'stale' : 'down';

  return {
    status,
    workerId: latest.workerId,
    host: latest.host ?? undefined,
    mode: latest.mode ?? undefined,
    lastSeenAt: new Date(lastSeenAtMs).toISOString(),
    ageMs,
  };
}
