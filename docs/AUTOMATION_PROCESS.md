# Kindoo Automation Process Runbook

This runbook documents how the door access automation queue works end-to-end and how to operate it in production-like environments.

## 1. Purpose

Automation converts due events into queue jobs and executes browser automation (Playwright) to create temporary door access in Kindoo without requiring manual action in the web UI.

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
  - Due window starts on the event date at `2 hours before license window start`
  - License window start is computed as `event start - 2 hours` (clamped to `05:00` local business time)
  - Practical result: jobs are usually due at `event start - 4 hours` on the same day
  - Catch-up still applies: if the event was created after due time but before event end, it is queued immediately

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
- `KINDOO_WORKER_INTERVAL_MS` (default 600000 ms). The worker reports its effective interval in every heartbeat, so the app does not need this value set in Vercel (see Worker heartbeat).
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

Note: the launchd script uses `macos/run-license-worker.sh`, which wraps the worker with
`caffeinate` to prevent automatic sleep while it runs. This only works while the Mac is on
and awake. For reliable operation, enable "Prevent automatic sleeping when the display is off"
in Battery settings while on power, and avoid closing the lid unless using clamshell mode.

## 7. Monitoring and Health

### Worker heartbeat

- Worker sends `POST /api/license-jobs/heartbeat` at the start of each cycle, with `mode`, `host` and `intervalMs`.
- `intervalMs` is the worker's effective sleep between cycles: `max(KINDOO_WORKER_INTERVAL_MS or 600000, 5000)`. Invalid values fall back to 10 minutes on the worker.
- App stores the latest heartbeat per worker in `license_worker_heartbeat`, including `interval_ms` (`src/lib/license-worker-health.ts`).
- The server accepts `intervalMs` only as a finite integer from 5000 to 3600000. Anything else is ignored and stored as null.
- Thresholds are derived from the stored interval, so nothing needs to be matched by hand in Vercel:
  - Heartbeat is sent at cycle start, so the gap between two heartbeats is the interval plus the cycle run time. The buffers cover the run time.
  - `healthy`: age up to 1.5 x interval + 5 minutes. `stale`: up to 4 x interval + 10 minutes. `down`: older.
  - With the Mac's 10 minute interval that is healthy to 20 minutes, stale to 50 minutes.
- Older workers that do not send `intervalMs` store null. For them the server falls back to `KINDOO_WORKER_INTERVAL_MS` in the app env (default 60000) with the legacy rule (1.5 x and 4 x, no buffer).
- The `workerPollIntervalMs` field in the job and worker-health responses carries the same effective interval.

### Health endpoint

- `GET /api/license-jobs/worker-health` (authenticated)
- Returns status:
  - `healthy`: heartbeat age within the thresholds above
  - `stale`: delayed heartbeat
  - `down`: heartbeat too old
  - `unknown`: no heartbeat recorded yet
- The health object also returns `intervalMs`, `intervalSource` (`worker` or `env`), `healthyThresholdMs` and `staleThresholdMs`.

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

## 12. Read-only Kindoo API Discovery

From `automation-service/`, run:

```bash
pnpm test
pnpm run api:probe
```

For an existing user lookup, add an email:

```bash
pnpm run api:probe --email spencer.nicol@gmail.com
```

This opt-in mode includes selected profile values for exact email matches and
records explicitly linked through their user IDs. Other users' profile values,
tokens, passwords, and verification codes are excluded. Treat these targeted
reports as private personal data. Each result identifies whether it came from
an observed browser response or a direct API replay. A site rule appearing in
the response is not treated as assigned access without verifying its assignment
relationship. Rule creators and inviters are not necessarily access recipients.

The probe uses the configured Kindoo login, opens the site and Users view, and
observes API traffic without inviting users or saving access rights. It does not
claim queue jobs. It replays observed GET requests and only the explicitly allowed
`KindooPullAppStartupData`, `KindooInitializeApp`, and
`KindooGetEnvironmentUsersLightWithTotalNumberOfRecords` POST operations.
Authentication and SignalR endpoints are excluded from replay.

Reports are written under `automation-service/.playwright/api-probe/`, which is
git-ignored. They contain endpoint paths, query parameter names, HTTP statuses,
and JSON structure, not credentials or session tokens. Response values are
excluded except for the explicitly requested user lookup described above. Observed
authentication headers and request bodies are retained only in memory for replay.

The live web app has been observed using ASMX operations under
`https://service89.kindoo.tech/WebService.asmx/`. This is an observed internal
service, not a verified public partner API contract or a stable configured base
URL. The probe discovers hosts from actual requests instead of hardcoding this
host. SignalR query parameters include `sessionTokenID`; a successful request
containing that parameter does not prove cookie-only authentication.

On 2026-10-06, the probe successfully logged in, opened the site and Users view,
and replayed `KindooPullAppStartupData` with HTTP 200 and the expected
`UpdateStatus`/`Dictionary` response structure. Observed request bodies were
non-JSON strings, so replay preserves their original encoding and content type.
An email-specific probe also verified that direct `KindooInitializeApp` replay
returns the logged-in user's profile and site membership. The Users view was
observed calling `KindooGetEnvironmentUsersLightWithTotalNumberOfRecords`.
On 2026-10-07, searching the Users view for an exact email and replaying its
observed user-list request returned HTTP 200 and exactly one matching membership
row. The lookup reports that row's EUID, invitation state, description, temporary
status, and access dates. Access schedules and permissions are extracted only
from the matching row, not from inviter or rule-owner references elsewhere.
The tested membership returned empty `AccessSchedules` and `AccessPermissions`
arrays. This does not establish absence of effective access: role-based rights
or further details may be outside this light user-list response. A known
non-manager user with explicit rule assignments should be verified next.
Door-level effective access and user-management writes remain unverified. The
queue worker has not been switched to API-based writes.

Before replacing browser writes, verify the site/user retrieval and access-rule
operations, their session-token requirements, and the resulting rights through a
read-back. Do not automatically retry ambiguous invitation/save failures or fall
back to browser writes without checking whether the original write succeeded.

### Optional Single-Page Export

```bash
pnpm run api:probe --export-users-page
```

This exports selected user and assigned-rule values from one retrieved Users
page, not a complete directory. Unlike the default shape-only report, this
export contains other users' personal data. Keep it private in the ignored
`.playwright/api-probe/` directory; do not attach it to commits or issues.

### API Probe Next Steps

1. With approval, compare a known non-manager user's explicit rule assignment
   against the Users UI, including dates and time zones. Empty light-response
   arrays must not be interpreted as proof of no effective door access.
2. Verify pagination, search filtering, and site boundaries before claiming a
   complete user directory or a definitive missing-user result.
3. Establish which cookies, headers, and session tokens each read requires, and
   how expiry is detected. An HTTP 200 alone does not prove business success or
   a supported public API; confirm vendor support before relying on it.
4. Expand offline fixtures for expired sessions, business errors, pagination,
   and effective-rights relationships. Recheck report redaction before adding
   endpoints or fields, and set a retention policy for private reports.
5. Keep production access changes on the browser worker. Any future write
   experiment needs separate approval, an isolated test user, read-back of the
   resulting rights, and reconciliation after ambiguous failures before retry.

## 13. Mac Worker Handoff

- The worker uses `.playwright/worker-profile/` relative to its working directory
  to preserve browser cookies and local storage between cycles and restarts.
  Keep this ignored directory private and do not open it from two workers at
  once. Kindoo can still expire sessions or require verification.
- The launchd wrapper uses `caffeinate -is`: the display can sleep, but idle
  sleep is inhibited while the worker runs. The system-sleep assertion applies
  on AC power. This uses more energy and does not keep an off Mac running or
  guarantee operation with the lid closed.
- Successful heartbeats now emit a timestamped `heartbeat accepted` log line.
  Log paths are `~/Library/Logs/kindoo-license-worker.out.log` and
  `~/Library/Logs/kindoo-license-worker.err.log`. No log rotation is configured
  by these changes; monitor their size.
- The restart package script rebuilds the source snapshot in `dist/` before
  restarting launchd. Use the existing launchd start, stop, status, and logs
  scripts from `automation-service/`; do not also launch a foreground worker.
- Offline browser tests cover profile persistence and timeout cleanup, not a
  real queued job. The user-approved live handled-manually skip test remains
  outstanding; identify the event before running it. Keep the conservative
  claim limit of 1 during this verification.
