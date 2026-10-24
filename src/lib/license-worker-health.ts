import { db } from '@/lib/db';
import { licenseWorkerHeartbeats } from '@/schema/schema';
import { desc } from 'drizzle-orm';

export type LicenseWorkerHealthStatus = 'healthy' | 'stale' | 'down' | 'unknown';

export const WORKER_INTERVAL_MIN_MS = 5_000;
export const WORKER_INTERVAL_MAX_MS = 3_600_000;
const FALLBACK_WORKER_INTERVAL_MS = 60_000;
// The worker sends its heartbeat at the START of a cycle and then runs the cycle before it sleeps,
// so the gap between two heartbeats is the interval plus the cycle's run time. When the worker
// reports its own interval, these buffers cover that run time.
const REPORTED_INTERVAL_HEALTHY_BUFFER_MS = 5 * 60_000;
const REPORTED_INTERVAL_STALE_BUFFER_MS = 10 * 60_000;

/**
 * Accepts the interval a worker reports in its heartbeat: a finite integer number of milliseconds
 * between 5 seconds and 1 hour. Anything else (missing, wrong type, out of range) returns null,
 * which makes the server fall back to the legacy env value for that heartbeat.
 */
export function sanitizeWorkerIntervalMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }
  if (value < WORKER_INTERVAL_MIN_MS || value > WORKER_INTERVAL_MAX_MS) return null;
  return value;
}

/** The legacy interval used only when the worker has not reported one (older worker versions). */
export function getEnvWorkerPollIntervalMs(): number {
  const parsed = Number.parseInt(
    process.env.KINDOO_WORKER_INTERVAL_MS ?? String(FALLBACK_WORKER_INTERVAL_MS),
    10
  );
  if (!Number.isFinite(parsed)) return FALLBACK_WORKER_INTERVAL_MS;
  return Math.max(parsed, WORKER_INTERVAL_MIN_MS);
}

/**
 * Health thresholds for a heartbeat age.
 * - Worker-reported interval: healthy up to 1.5 x interval + 5 min, stale up to 4 x interval + 10 min.
 * - No reported interval (old worker): the legacy rule, 1.5 x and 4 x the env interval, no buffer.
 */
export function computeWorkerThresholds(
  intervalMs: number,
  source: 'worker' | 'env'
): { healthyThresholdMs: number; staleThresholdMs: number } {
  if (source === 'worker') {
    return {
      healthyThresholdMs: Math.round(intervalMs * 1.5) + REPORTED_INTERVAL_HEALTHY_BUFFER_MS,
      staleThresholdMs: Math.round(intervalMs * 4) + REPORTED_INTERVAL_STALE_BUFFER_MS,
    };
  }
  return {
    healthyThresholdMs: Math.max(Math.round(intervalMs * 1.5), 10_000),
    staleThresholdMs: Math.max(Math.round(intervalMs * 4), 30_000),
  };
}

export async function recordWorkerHeartbeat(input: {
  workerId: string;
  host?: string;
  mode?: string;
  intervalMs?: unknown;
}) {
  const workerId = input.workerId.trim() || 'local-worker';
  const host = input.host?.trim() || null;
  const mode = input.mode?.trim() || null;
  // Always reflects the latest heartbeat: a worker that stops sending it goes back to the fallback.
  const intervalMs = sanitizeWorkerIntervalMs(input.intervalMs);

  await db
    .insert(licenseWorkerHeartbeats)
    .values({
      workerId,
      host,
      mode,
      intervalMs,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: licenseWorkerHeartbeats.workerId,
      set: {
        host,
        mode,
        intervalMs,
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
      intervalMs: licenseWorkerHeartbeats.intervalMs,
      lastSeenAt: licenseWorkerHeartbeats.lastSeenAt,
    })
    .from(licenseWorkerHeartbeats)
    .orderBy(desc(licenseWorkerHeartbeats.lastSeenAt))
    .limit(1);

  return latest ?? null;
}

/**
 * The interval the banner and the job routes should use: the latest heartbeat's reported interval,
 * else the env value (older workers, or no heartbeat yet).
 */
export async function getEffectiveWorkerPollIntervalMs(): Promise<number> {
  try {
    const latest = await getLatestWorkerHeartbeat();
    const reported = sanitizeWorkerIntervalMs(latest?.intervalMs);
    if (reported !== null) return reported;
  } catch (error) {
    console.error('[license-worker-health] Failed to load heartbeat interval:', error);
  }
  return getEnvWorkerPollIntervalMs();
}

export async function getWorkerHealth(): Promise<{
  status: LicenseWorkerHealthStatus;
  workerId?: string;
  host?: string;
  mode?: string;
  lastSeenAt?: string;
  ageMs?: number;
  intervalMs?: number;
  intervalSource?: 'worker' | 'env';
  healthyThresholdMs?: number;
  staleThresholdMs?: number;
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
  const reported = sanitizeWorkerIntervalMs(latest.intervalMs);
  const intervalSource = reported !== null ? ('worker' as const) : ('env' as const);
  const intervalMs = reported ?? getEnvWorkerPollIntervalMs();
  const { healthyThresholdMs, staleThresholdMs } = computeWorkerThresholds(
    intervalMs,
    intervalSource
  );

  const status: LicenseWorkerHealthStatus =
    ageMs <= healthyThresholdMs ? 'healthy' : ageMs <= staleThresholdMs ? 'stale' : 'down';

  return {
    status,
    workerId: latest.workerId,
    host: latest.host ?? undefined,
    mode: latest.mode ?? undefined,
    lastSeenAt: new Date(lastSeenAtMs).toISOString(),
    ageMs,
    intervalMs,
    intervalSource,
    healthyThresholdMs,
    staleThresholdMs,
  };
}
