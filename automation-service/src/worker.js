import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  consumeAutomationRunLog,
  createAutomationRuntime,
  disposeAutomationRuntime,
  runAutomation,
  validatePayload,
} from './server.js';

const APP_URL = process.env.KINDOO_APP_URL?.replace(/\/$/, '');
const WORKER_TOKEN = process.env.KINDOO_WORKER_TOKEN;
const WORKER_ID = process.env.KINDOO_WORKER_ID?.trim() || `${hostname()}-kindoo-worker`;
const CLAIM_LIMIT = Number.parseInt(process.env.KINDOO_WORKER_CLAIM_LIMIT ?? '3', 10);
const WATCH_INTERVAL_PARSED_MS = Number.parseInt(
  process.env.KINDOO_WORKER_INTERVAL_MS ?? '600000',
  10
);
// The effective sleep between watch cycles: never below 5 seconds, 10 minutes if the value is invalid.
const WATCH_INTERVAL_MS = Math.max(
  Number.isFinite(WATCH_INTERVAL_PARSED_MS) ? WATCH_INTERVAL_PARSED_MS : 600000,
  5000
);
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
  const url = `${APP_URL}${path}`;
  let response;
  try {
    response = await globalThis.fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Worker-Token': WORKER_TOKEN,
        'X-Worker-Id': WORKER_ID,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown fetch failure.';
    console.error(`[worker:${WORKER_ID}] fetch failed`, {
      url,
      method,
      message,
    });
    throw error;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'Request failed.';
    throw new Error(`${method} ${path} failed (${response.status}): ${message}`);
  }

  return payload;
}

async function markJobFailed(jobId, details, runLog = '') {
  await requestJson(`/api/license-jobs/${jobId}/fail`, 'POST', {
    details: String(details).slice(0, 4000),
    runLog: String(runLog).slice(0, 120000),
  });
}

async function markJobCompleted(jobId, result, runLog = '') {
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
    runLog: String(runLog).slice(0, 120000),
  });
}

/**
 * Pre-run check. A job claimed earlier in the batch can wait several minutes before it starts,
 * and an admin may mark its event as "handled manually" in that time. Ask the server right
 * before running. Returns false when the job must not run.
 * An older server without this route (404) is treated as "proceed" so the worker still works
 * during a rollout.
 */
async function confirmJobCanStart(jobId) {
  try {
    const response = await requestJson(`/api/license-jobs/${jobId}/start`, 'POST');
    if (response?.proceed === false) {
      console.log(
        `[worker:${WORKER_ID}] job ${jobId} stands down (${response.reason ?? 'not allowed to start'})`
      );
      return false;
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('(404)')) {
      return true;
    }
    throw error;
  }
}

async function sendHeartbeat(mode) {
  await requestJson('/api/license-jobs/heartbeat', 'POST', {
    mode,
    host: WORKER_HOST,
    // The effective sleep between cycles, so the app can size its offline banner from the worker itself.
    intervalMs: WATCH_INTERVAL_MS,
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
    skipped: 0,
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
        await markJobFailed(job.id, validationError, consumeAutomationRunLog(requestId));
        continue;
      }

      try {
        if (!(await confirmJobCanStart(job.id))) {
          cycleStats.skipped += 1;
          continue;
        }
        if (!sharedRuntime) {
          sharedRuntime = await createAutomationRuntime(requestId);
        }
        const result = await runAutomation(payload, requestId, sharedRuntime);
        await markJobCompleted(job.id, result, consumeAutomationRunLog(requestId));
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
        await markJobFailed(job.id, message, consumeAutomationRunLog(requestId));
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
    skipped: cycleStats.skipped,
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
    await sleep(WATCH_INTERVAL_MS);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Worker startup failed.';
  console.error(`[worker:${WORKER_ID}] fatal: ${message}`);
  process.exitCode = 1;
});
