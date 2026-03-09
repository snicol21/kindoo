# Kindoo Automation Process Runbook

This runbook documents how the Kindoo license automation queue works end-to-end and how to operate it in production-like environments.

## 1. Purpose

Automation converts due events into queue jobs and executes browser automation (Playwright) to create temporary Kindoo licenses without requiring manual action in the web UI.

## 2. Components

- Main app (Next.js)
  - Owns queue data and API routes under `src/app/api/license-jobs/`
- Worker service (`automation-service/`)
  - Polls queue endpoints, runs Playwright automation, reports completion/failure
- DB table
  - `kindoo_license_job` tracks queue state and execution metadata
- Event stream
  - SSE route publishes per-user job state updates

## 3. Queue Lifecycle

### Step 1: Auto-schedule due events

Worker calls:

- `POST /api/license-jobs/schedule-due`

API behavior:

- Finds candidate events where `kindooLicenseCreated = false`
- Filters out events with missing email, unsupported building rule, or existing job
- Queues jobs when event is within due window

Important:

- This is worker-driven. UI activity is not required.

### Step 2: Claim queued jobs

Worker calls:

- `POST /api/license-jobs/claim`

API behavior:

- Recovers stale `processing` jobs older than `KINDOO_WORKER_STALE_MINUTES`
- Claims up to `limit` jobs by flipping status to `processing`
- Increments `attempts`

### Step 3: Execute automation

Worker behavior:

- Validates each claimed payload
- Runs Playwright automation against Kindoo
- Reuses runtime session in-batch for efficiency where possible

### Step 4a: Mark completed

Worker calls:

- `POST /api/license-jobs/:jobId/complete`

API behavior:

- Sets job `status = completed`
- Persists completion metadata (`completionType`, `durationMs`, `sessionReused`)
- Sets related event `kindooLicenseCreated = true`

### Step 4b: Mark failed

Worker calls:

- `POST /api/license-jobs/:jobId/fail`

API behavior:

- Sets job `status = failed`
- Stores `lastError`

## 4. Worker Modes

Defined in `automation-service/src/worker.js` and package scripts.

- `worker:once`
  - One cycle, then exit
- `worker:drain`
  - Process until queue empty, then exit
- `worker:watch` / `worker`
  - Long-running loop with sleep interval (`KINDOO_WORKER_INTERVAL_MS`)

## 5. Required Configuration

### 5.1 Main app env (`.env.local`)

Required for queue auth/recovery:

- `KINDOO_WORKER_TOKEN`
- `KINDOO_WORKER_STALE_MINUTES`

### 5.2 Worker env (`automation-service/.env`)

Required:

- `KINDOO_APP_URL` (base URL of Next.js app)
- `KINDOO_WORKER_TOKEN` (must exactly match app)
- `KINDOO_URL`, `KINDOO_EMAIL`, `KINDOO_CHURCH_USERNAME`, `KINDOO_CHURCH_PASSWORD`

Optional tuning:

- `KINDOO_WORKER_ID`
- `KINDOO_WORKER_CLAIM_LIMIT` (default 3)
- `KINDOO_WORKER_INTERVAL_MS` (default 600000 ms)
- Playwright runtime values

## 6. Local and MacOS Operations

From `automation-service/`:

```bash
pnpm install
pnpm run worker:once
pnpm run worker:drain
pnpm run worker:watch
```

For persistent macOS operation via launchd:

```bash
pnpm run worker:launchd:install
pnpm run worker:launchd:status
pnpm run worker:launchd:logs
```

The installer script builds `dist/`, creates `~/Library/LaunchAgents/com.kindoo.license-worker.plist`, and starts it.

## 7. Monitoring and Health

### Worker heartbeat

- Worker sends `POST /api/license-jobs/heartbeat` each cycle.
- App stores in-memory heartbeat snapshots (`src/lib/license-worker-health.ts`).

### Health endpoint

- `GET /api/license-jobs/worker-health` (authenticated)
- Returns status:
  - `healthy`: heartbeat age within expected interval
  - `stale`: delayed heartbeat
  - `down`: heartbeat too old
  - `unknown`: no heartbeat yet in current process lifecycle

### Real-time job stream

- `GET /api/license-jobs/stream`
- Uses SSE; publishes per-user job updates from queue transitions

## 8. Failure and Recovery Model

- Worker crash during `processing`:
  - Jobs are recovered back to `queued` when stale threshold is exceeded
- Automation failure:
  - Job marked `failed` with error detail
- Invalid payload:
  - Job marked `failed`

Recommended response:

- Check worker logs first
- Validate token/config parity between app and worker
- Confirm `KINDOO_APP_URL` reachability and auth headers

## 9. Security Model

- Worker-only APIs require `X-Worker-Token`
- Shared secret is compared against `KINDOO_WORKER_TOKEN`
- Unauthorized calls return `401`

Best practices:

- Rotate worker token periodically
- Use long random token values
- Limit env file access and avoid committing secrets

## 10. FAQ

### Do users need to be inside the app for auto-scheduling to run?

No. Auto-scheduling is executed by the worker (`schedule-due` call) and runs independently of UI activity.

### What must be running for automation to work?

- Next.js app/API must be reachable.
- Worker process must be running (`watch`, launchd, or periodic manual execution).

### Can multiple workers run at once?

Yes. Claiming is optimistic and status-gated (`queued` -> `processing`) to avoid double-processing the same job.

## 11. Quick Triage Checklist

1. Confirm app and worker tokens match.
2. Confirm worker can reach `KINDOO_APP_URL`.
3. Check worker heartbeat (`/api/license-jobs/worker-health`).
4. Inspect launchd status/logs if on macOS.
5. Look for job errors in `failed` rows and retry strategy as needed.
