import 'dotenv/config';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  createAutomationRuntime,
  disposeAutomationRuntime,
  runAutomation,
  validatePayload,
} from './server.js';

const APP_URL = process.env.KINDOO_APP_URL?.replace(/\/$/, '');
const WORKER_TOKEN = process.env.KINDOO_WORKER_TOKEN;
const WORKER_ID = process.env.KINDOO_WORKER_ID?.trim() || `${hostname()}-kindoo-worker`;
const CLAIM_LIMIT = Number.parseInt(process.env.KINDOO_WORKER_CLAIM_LIMIT ?? '3', 10);
const WATCH_INTERVAL_MS = Number.parseInt(process.env.KINDOO_WORKER_INTERVAL_MS ?? '600000', 10);
const WORKER_HOST = hostname();

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function requestJson(path, method = 'POST', body = undefined) {
  const response = await globalThis.fetch(`${APP_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Worker-Token': WORKER_TOKEN,
      'X-Worker-Id': WORKER_ID,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Request failed.';
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`);
  }

  return payload;
}

async function markJobFailed(jobId, details) {
  await requestJson(`/api/license-jobs/${jobId}/fail`, 'POST', {
    details: String(details).slice(0, 4000),
  });
}

async function markJobCompleted(jobId, result) {
  const completionType =
    typeof result?.completionType === 'string'
      ? result.completionType
      : 'temporary-license-created';
  const statusDetails =
    completionType === 'existing-active-license'
      ? 'User already has an active Kindoo license.'
      : 'Temporary Kindoo license was created successfully.';

  await requestJson(`/api/license-jobs/${jobId}/complete`, 'POST', {
    completionType,
    statusDetails,
    durationMs: result?.durationMs,
    sessionReused: result?.sessionReused,
  });
}

async function sendHeartbeat(mode) {
  await requestJson('/api/license-jobs/heartbeat', 'POST', {
    mode,
    host: WORKER_HOST,
  });
}

async function scheduleDueEvents() {
  const response = await requestJson('/api/license-jobs/schedule-due', 'POST');
  const count = Number(response?.count ?? 0);
  if (Number.isFinite(count) && count > 0) {
    console.log(`[worker:${WORKER_ID}] auto-queued ${count} due event(s)`);
  }
}

async function runOneCycle() {
  await scheduleDueEvents();

  const claimPayload = await requestJson('/api/license-jobs/claim', 'POST', {
    limit: CLAIM_LIMIT,
  });

  const jobs = Array.isArray(claimPayload?.jobs) ? claimPayload.jobs : [];
  if (jobs.length === 0) {
    console.log(`[worker:${WORKER_ID}] no queued jobs`);
    return 0;
  }

  console.log(`[worker:${WORKER_ID}] claimed ${jobs.length} job(s)`);

  let sharedRuntime = null;
  const cycleStats = {
    completed: 0,
    failed: 0,
    existingActiveLicense: 0,
    temporaryLicenseCreated: 0,
    sessionReusedCount: 0,
    totalDurationMs: 0,
  };

  try {
    for (const job of jobs) {
      const requestId = randomUUID();
      const payload = job?.payload ?? {};
      const validationError = validatePayload(payload);

      if (validationError) {
        console.error(`[worker:${WORKER_ID}] job ${job.id} invalid payload: ${validationError}`);
        await markJobFailed(job.id, validationError);
        continue;
      }

      try {
        if (!sharedRuntime) {
          sharedRuntime = await createAutomationRuntime(requestId);
        }
        const result = await runAutomation(payload, requestId, sharedRuntime);
        await markJobCompleted(job.id, result);
        console.log(`[worker:${WORKER_ID}] job ${job.id} completed`, {
          completionType: result?.completionType ?? 'temporary-license-created',
          sessionReused: result?.sessionReused,
          durationMs: result?.durationMs,
        });

        cycleStats.completed += 1;
        if (result?.completionType === 'existing-active-license') {
          cycleStats.existingActiveLicense += 1;
        } else {
          cycleStats.temporaryLicenseCreated += 1;
        }
        if (result?.sessionReused) {
          cycleStats.sessionReusedCount += 1;
        }
        if (typeof result?.durationMs === 'number' && Number.isFinite(result.durationMs)) {
          cycleStats.totalDurationMs += result.durationMs;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Automation run failed.';
        console.error(`[worker:${WORKER_ID}] job ${job.id} failed: ${message}`);
        await markJobFailed(job.id, message);
        cycleStats.failed += 1;

        // If the page/context got into a bad state, rebuild runtime for remaining jobs.
        await disposeAutomationRuntime(sharedRuntime);
        sharedRuntime = null;
      }
    }
  } finally {
    await disposeAutomationRuntime(sharedRuntime);
  }

  const avgDurationMs =
    cycleStats.completed > 0 ? Math.round(cycleStats.totalDurationMs / cycleStats.completed) : 0;
  console.log(`[worker:${WORKER_ID}] batch summary`, {
    claimed: jobs.length,
    completed: cycleStats.completed,
    failed: cycleStats.failed,
    temporaryLicenseCreated: cycleStats.temporaryLicenseCreated,
    existingActiveLicense: cycleStats.existingActiveLicense,
    sessionReusedCount: cycleStats.sessionReusedCount,
    avgDurationMs,
  });

  return jobs.length;
}

async function main() {
  requireEnv('KINDOO_APP_URL', APP_URL);
  requireEnv('KINDOO_WORKER_TOKEN', WORKER_TOKEN);

  const mode = process.argv.includes('--watch')
    ? 'watch'
    : process.argv.includes('--drain')
      ? 'drain'
      : 'once';

  console.log(`[worker:${WORKER_ID}] starting in ${mode} mode`);
  await sendHeartbeat(mode);

  if (mode === 'once') {
    await sendHeartbeat(mode);
    await runOneCycle();
    return;
  }

  if (mode === 'drain') {
    while (true) {
      await sendHeartbeat(mode);
      const processed = await runOneCycle();
      if (processed === 0) {
        break;
      }
    }
    return;
  }

  while (true) {
    try {
      await sendHeartbeat(mode);
      await runOneCycle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Worker cycle failed.';
      console.error(`[worker:${WORKER_ID}] ${message}`);
    }
    await sleep(Math.max(WATCH_INTERVAL_MS, 5000));
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Worker startup failed.';
  console.error(`[worker:${WORKER_ID}] fatal: ${message}`);
  process.exitCode = 1;
});
