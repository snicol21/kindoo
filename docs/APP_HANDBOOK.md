# Kindoo App Handbook

This handbook describes what the Kindoo app does, how it is structured, and how to run and operate it safely.

## 1. What This App Is

Kindoo is a private event management dashboard used to track building events and automate Kindoo temporary license creation.

Core goals:

- Keep event and contact data organized by ward/building.
- Support role-based access for normal users, managers, and admins.
- Queue and process license automation work asynchronously via a worker.

## 2. Tech Stack

- Runtime: Node.js 20+
- Framework: Next.js 16 (App Router) + React 19
- Language: TypeScript
- Auth: Auth.js v5 (Credentials provider)
- Database ORM: Drizzle ORM
- Database target: Turso/libSQL (local SQLite in dev)
- Client data/cache: TanStack Query v5
- UI: shadcn/ui, Radix UI, Tailwind CSS
- Worker automation: Node.js + Playwright (`automation-service/`)

## 3. Repository Layout

- `src/app/`: Next.js routes (pages + API routes)
- `src/actions/`: Server Actions for event/contact/template workflows
- `src/components/`: Shared React UI and feature components
- `src/lib/`: Auth, DB, matching, worker-health and shared domain utilities
- `src/schema/`: Drizzle schema + inferred types
- `drizzle/`: SQL migrations
- `automation-service/`: Worker process that claims and executes license jobs

## 4. Core Domain Model

Defined in `src/schema/schema.ts`.

- `user`
  - Identity + role (`admin`, `manager`, `user`)
  - Preferences such as `licenseLeadDays` and `defaultBuilding`
- `contact`
  - Name, ward, email/phone (at least one contact method required)
- `event`
  - Building, date/time, linked contact, creator, and `kindooLicenseCreated` flag
- `kindoo_license_job`
  - Queue record for automation work (`queued`, `processing`, `completed`, `failed`)
  - Stores payload fields, attempts, completion details, and worker metadata
- `message_template` and `message_template_default`
  - User-scoped messaging templates plus defaults

## 5. Authentication and Authorization

Auth is implemented in `src/lib/auth.ts`.

- Sign-in: credentials-based (`email` + `password`)
- Session strategy: JWT
- Role handling:
  - User role is loaded from DB into session
  - `ADMIN_EMAILS` and admin bootstrap env can elevate/create admin users
- Route protection:
  - Dashboard routes require authenticated sessions
- Resource protection:
  - Server Actions and API handlers validate session/ownership/role

## 6. Main Runtime Flows

### 6.1 Event management

- Event create/update/delete is handled through server actions in `src/actions/events.ts`.
- Input is normalized/validated (time windows, name format, contact method requirement).
- Contacts are reused when possible and orphan cleanup is performed when needed.
- Cache invalidation uses revalidation tags by user/building.

### 6.2 Contact management

- Contact search and updates are in `src/actions/contacts.ts`.
- Search supports strong matching for name/email/phone and ranking for name input.

### 6.3 License automation queue (high level)

- Jobs are created for events needing Kindoo licensing.
- Worker process schedules due events, claims queued jobs, then marks complete/fail.
- UI receives live updates via SSE (`/api/license-jobs/stream`).

See `docs/AUTOMATION_PROCESS.md` for full details.

## 7. Environment Configuration

### 7.1 Main app (`.env.local`)

Use `.env.example` as the source template.

Required categories:

- DB: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- Auth: `AUTH_SECRET`, `AUTH_URL`
- Admin/bootstrap: `ADMIN_EMAILS`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`
- Worker auth/health: `KINDOO_WORKER_TOKEN`, `KINDOO_WORKER_STALE_MINUTES`
- Optional storage: `BLOB_READ_WRITE_TOKEN`

### 7.2 Worker (`automation-service/.env`)

Use `automation-service/.env.example` as the source template.

Important values:

- Connectivity: `KINDOO_APP_URL`
- Auth link: `KINDOO_WORKER_TOKEN` (must match app env)
- Worker tuning: `KINDOO_WORKER_ID`, `KINDOO_WORKER_CLAIM_LIMIT`, `KINDOO_WORKER_INTERVAL_MS`
- Kindoo credentials and Playwright runtime settings

## 8. Local Development

From repo root:

```bash
pnpm install
pnpm dev
```

Useful root scripts (`package.json`):

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm db:generate`
- `pnpm db:push`
- `pnpm db:migrate`
- `pnpm db:studio`

## 9. Database and Migrations

- Schema source: `src/schema/schema.ts`
- Migration files: `drizzle/*.sql`
- Typical workflow:

```bash
pnpm db:generate
pnpm db:migrate
```

For local reset:

```bash
pnpm db:reset
```

## 10. Operations and Monitoring

- Worker health endpoint: `GET /api/license-jobs/worker-health` (auth required)
- Worker heartbeat endpoint: `POST /api/license-jobs/heartbeat` (worker token required)
- SSE updates: `GET /api/license-jobs/stream` (auth required)

Operational indicators:

- Healthy worker heartbeat freshness
- Queue status transitions (`queued` -> `processing` -> `completed`/`failed`)
- `event.kindooLicenseCreated` set when job completes successfully

## 11. Troubleshooting Guide

### App cannot enqueue or process jobs

Check:

- `KINDOO_WORKER_TOKEN` exists in both app and worker env
- Worker can reach `KINDOO_APP_URL`
- Worker process is running (`automation-service` scripts or launchd)

### Jobs stuck in `processing`

- Claim endpoint auto-recovers stale processing locks based on `KINDOO_WORKER_STALE_MINUTES`.
- Confirm worker heartbeat and logs to identify repeated failures.

### Worker health shows `unknown`/`down`

- `unknown`: no heartbeat has been recorded yet
- `down`: heartbeat is older than threshold; verify worker process and logs

## 12. Security Notes

- Worker routes are protected by shared token (`X-Worker-Token`).
- Keep `KINDOO_WORKER_TOKEN` private and rotate periodically.
- Do not commit `.env.local` or `automation-service/.env`.
- Keep bootstrap admin password temporary and rotate/remove after setup.

## 13. Maintenance Checklist

- Keep dependencies updated in both root and `automation-service/`.
- Validate migrations before production rollout.
- Review worker logs regularly if automation is business-critical.
- Confirm auth/session flows after Next/Auth upgrades.
