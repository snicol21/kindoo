export type LicenseWorkerHealthStatus = 'healthy' | 'stale' | 'down' | 'unknown';

export type LicenseWorkerHeartbeat = {
  workerId: string;
  host?: string;
  mode?: string;
  lastSeenAtMs: number;
};

const heartbeats = new Map<string, LicenseWorkerHeartbeat>();

export function recordWorkerHeartbeat(input: { workerId: string; host?: string; mode?: string }) {
  const workerId = input.workerId.trim() || 'local-worker';
  heartbeats.set(workerId, {
    workerId,
    host: input.host,
    mode: input.mode,
    lastSeenAtMs: Date.now(),
  });
}

export function getLatestWorkerHeartbeat(): LicenseWorkerHeartbeat | null {
  let latest: LicenseWorkerHeartbeat | null = null;
  for (const heartbeat of heartbeats.values()) {
    if (!latest || heartbeat.lastSeenAtMs > latest.lastSeenAtMs) {
      latest = heartbeat;
    }
  }
  return latest;
}

export function getWorkerHealth(workerPollIntervalMs: number): {
  status: LicenseWorkerHealthStatus;
  workerId?: string;
  host?: string;
  mode?: string;
  lastSeenAt?: string;
  ageMs?: number;
} {
  const latest = getLatestWorkerHeartbeat();
  if (!latest) {
    return { status: 'unknown' };
  }

  const now = Date.now();
  const ageMs = Math.max(0, now - latest.lastSeenAtMs);
  const healthyThresholdMs = Math.max(Math.round(workerPollIntervalMs * 1.5), 10_000);
  const staleThresholdMs = Math.max(Math.round(workerPollIntervalMs * 4), 30_000);

  const status: LicenseWorkerHealthStatus =
    ageMs <= healthyThresholdMs ? 'healthy' : ageMs <= staleThresholdMs ? 'stale' : 'down';

  return {
    status,
    workerId: latest.workerId,
    host: latest.host,
    mode: latest.mode,
    lastSeenAt: new Date(latest.lastSeenAtMs).toISOString(),
    ageMs,
  };
}
