// Scripted check for the "Mark as handled manually" override. It runs the service layer and the
// worker route handlers against a LOCAL SQLite file and never touches a remote database.
//
// Prepare a throwaway DB (a dev copy of the schema with drizzle/0019 and drizzle/0020 applied),
// then run:
//   env -u TURSO_AUTH_TOKEN TURSO_DATABASE_URL=file:/path/to/check.db \
//     pnpm dlx tsx --conditions=react-server scripts/manual-override-check.ts
//
// The script refuses to run unless TURSO_DATABASE_URL is a file: URL, and refuses to run when
// Twilio credentials are present in the environment (it would otherwise try to send texts).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbUrl = process.env.TURSO_DATABASE_URL ?? '';
if (!dbUrl.startsWith('file:')) {
  console.error('Refusing to run: TURSO_DATABASE_URL must be a local file: URL.');
  process.exit(2);
}
if (process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_AUTH_TOKEN) {
  console.error('Refusing to run: unset TWILIO_* so the check cannot send texts.');
  process.exit(2);
}
process.env.KINDOO_WORKER_TOKEN = 'check-worker-token';

// Outside Next, 'server-only' does not resolve. Point it at an empty file for this script only.
const serverOnlyStub = join(tmpdir(), 'manual-override-check-server-only.js');
writeFileSync(serverOnlyStub, '');
const moduleInternals = Module as unknown as {
  _resolveFilename: (request: string, ...rest: unknown[]) => string;
};
const originalResolve = moduleInternals._resolveFilename;
moduleInternals._resolveFilename = function (request: string, ...rest: unknown[]) {
  return request === 'server-only' ? serverOnlyStub : originalResolve.call(this, request, ...rest);
};

// Fake the Twilio client so no text can leave this machine. 'twilio' is replaced at load time.
const fakeTwilio = {
  calls: [] as { to: string; body: string }[],
  mode: 'ok' as 'ok' | 'fail' | 'throw',
};
const moduleLoader = Module as unknown as {
  _load: (request: string, ...rest: unknown[]) => unknown;
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'twilio') {
    return () => ({
      messages: {
        create: async (input: { to: string; body: string }) => {
          fakeTwilio.calls.push({ to: input.to, body: input.body });
          if (fakeTwilio.mode === 'throw') throw new Error('provider exploded');
          if (fakeTwilio.mode === 'fail') throw new Error('fake provider failure');
          return { sid: 'fake-sid' };
        },
      },
    });
  }
  return originalLoad.call(this, request, ...rest);
};
const setSmsEnv = (on: boolean) => {
  for (const key of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']) {
    if (on) process.env[key] = 'fake';
    else delete process.env[key];
  }
};

// next/cache needs a Next request context. Stub revalidateTag for this script only.
const nextCache = createRequire(__filename)('next/cache') as {
  revalidateTag: (...args: unknown[]) => void;
};
Object.defineProperty(nextCache, 'revalidateTag', { value: () => undefined, configurable: true });

const results: { name: string; ok: boolean; error?: string }[] = [];
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, error: message });
    const where =
      error instanceof Error
        ? (error.stack ?? '').split('\n').find((l) => l.includes('manual-override-check.ts'))
        : '';
    console.log(`FAIL  ${name}\n      ${message.split('\n')[0]} ${where?.trim() ?? ''}`);
  }
}

async function main() {
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/schema/schema');
  const { and, eq, sql } = await import('drizzle-orm');
  const mo = await import('../src/lib/manual-override');
  const fmt = await import('../src/lib/manual-override-format');
  const sched = await import('../src/lib/license-schedule');
  const perms = await import('../src/lib/permissions');
  const utils = await import('../src/components/DashboardClient/utils');
  const claimRoute = await import('../src/app/api/license-jobs/claim/route');
  const scheduleRoute = await import('../src/app/api/license-jobs/schedule-due/route');
  const startRoute = await import('../src/app/api/license-jobs/[jobId]/start/route');
  const completeRoute = await import('../src/app/api/license-jobs/[jobId]/complete/route');
  const failRoute = await import('../src/app/api/license-jobs/[jobId]/fail/route');
  const { events, contacts, users, kindooLicenseJobs, eventManualOverrideLog, notificationOutbox } =
    schema;

  const tag = `chk${Date.now().toString(36)}`;
  const id = (name: string) => `${tag}-${name}`;

  // ── Fixtures ─────────────────────────────────────────────────────────────────
  const mkUser = async (
    name: string,
    role: 'admin' | 'stake_manager' | 'ward_manager' | 'ward_user',
    ward: '1st Ward' | '3rd Ward'
  ) => {
    const userId = id(name);
    await db.insert(users).values({
      id: userId,
      name: `${name} Person`,
      email: `${userId}@example.test`,
      role,
      ward,
      phone: '5555550100',
    });
    return { userId, role, ward };
  };
  const admin = await mkUser('admin', 'admin', '1st Ward');
  const stake = await mkUser('stake', 'stake_manager', '1st Ward');
  const wardMgr = await mkUser('wardmgr', 'ward_manager', '1st Ward');
  const otherWardMgr = await mkUser('otherwardmgr', 'ward_manager', '3rd Ward');
  const wardUser = await mkUser('warduser', 'ward_user', '1st Ward');

  // The ward user who owns the events has SMS on, so an unsuppressed text would leave an outbox row.
  await db.insert(schema.notificationPreferences).values({
    userId: wardUser.userId,
    smsEnabled: true,
    smsPhone: '5555550123',
    licenseJobCompletedSms: true,
    licenseJobFailedSms: true,
  });

  const contactId = id('contact');
  await db.insert(contacts).values({
    id: contactId,
    name: 'Check Contact',
    ward: '1st Ward',
    email: `${contactId}@example.test`,
    phone: '5555550199',
  });

  const now = sched.getCurrentYmdHmInTimeZone(sched.SCHEDULE_TIMEZONE);
  const ymdPlusDays = (days: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: sched.SCHEDULE_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  };
  const tomorrow = ymdPlusDays(1);
  const yesterday = ymdPlusDays(-1);

  const mkEvent = async (
    name: string,
    opts?: { date?: string; start?: string; end?: string; licenseCreated?: boolean }
  ) => {
    const eventId = id(name);
    await db.insert(events).values({
      id: eventId,
      building: 'Stake Center',
      eventDate: opts?.date ?? tomorrow,
      startTime: opts?.start ?? '18:00',
      endTime: opts?.end ?? '20:00',
      contactId,
      description: `check ${name}`,
      eventType: 'Ward',
      kindooLicenseCreated: opts?.licenseCreated ?? false,
      userId: wardUser.userId,
    });
    return eventId;
  };
  const mkJob = async (
    name: string,
    eventId: string,
    status: 'queued' | 'processing' | 'failed' | 'completed',
    extra?: Partial<typeof kindooLicenseJobs.$inferInsert>
  ) => {
    const jobId = id(name);
    await db.insert(kindooLicenseJobs).values({
      id: jobId,
      eventId,
      requestedByUserId: wardUser.userId,
      status,
      email: 'check@example.test',
      description: 'check',
      timezone: 'America/Denver',
      startDate: tomorrow,
      startTime: '16:00',
      endDate: tomorrow,
      endTime: '22:00',
      kindooAccessRule: 'STAKE CENTER - LIMITED',
      ...(status === 'processing'
        ? { claimedAt: new Date(), workerId: 'check-worker', attempts: 1 }
        : {}),
      ...extra,
    });
    return jobId;
  };
  const getEvent = async (eventId: string) =>
    (await db.select().from(events).where(eq(events.id, eventId)))[0];
  const getJob = async (jobId: string) =>
    (await db.select().from(kindooLicenseJobs).where(eq(kindooLicenseJobs.id, jobId)))[0];
  const logRows = (eventId: string) =>
    db.select().from(eventManualOverrideLog).where(eq(eventManualOverrideLog.eventId, eventId));
  const outboxCount = async () =>
    Number((await db.select({ n: sql<number>`count(*)` }).from(notificationOutbox))[0].n);

  const workerHeaders = { 'x-worker-token': 'check-worker-token', 'x-worker-id': 'check-worker' };
  const post = (path: string, body?: unknown) =>
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { ...workerHeaders, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const claimAll = async () => {
    const res = await claimRoute.POST(post('/api/license-jobs/claim', { limit: 20 }));
    return (await res.json()) as { jobs: { id: string }[] };
  };
  const mark = (
    who: {
      userId: string;
      role: never | 'admin' | 'stake_manager' | 'ward_manager' | 'ward_user';
      ward: '1st Ward' | '3rd Ward';
    },
    eventId: string,
    reason = 'worker_offline',
    note?: string
  ) => mo.markEventHandledManuallyForAccess(who, { eventId, reason, note });

  // ── 1. Permissions ───────────────────────────────────────────────────────────
  await check(
    'permission helpers: only admin may mark; note visible to admin and stake_manager',
    async () => {
      assert.equal(perms.canMarkEventHandledManually('admin'), true);
      for (const role of ['stake_manager', 'ward_manager', 'ward_user'] as const) {
        assert.equal(perms.canMarkEventHandledManually(role), false, role);
      }
      assert.equal(perms.canViewManualOverrideNote('stake_manager'), true);
      assert.equal(perms.canViewManualOverrideNote('ward_manager'), false);
    }
  );

  await check('non-admin roles are rejected for mark, preview and reopen', async () => {
    const eventId = await mkEvent('perm');
    for (const who of [stake, wardMgr, wardUser]) {
      const r = await mark(who, eventId);
      assert.equal(r.success, false, who.role);
      const p = await mo.previewReopenForAccess(who, { eventId });
      assert.equal(p.success, false, who.role);
      const o = await mo.reopenEventForAutomationForAccess(who, { eventId });
      assert.equal(o.success, false, who.role);
    }
    assert.equal((await getEvent(eventId)).manualHandledAt, null);
    assert.equal((await logRows(eventId)).length, 0);
  });

  // ── 2. Validation and the ended-event block ──────────────────────────────────
  await check(
    'validation: reason required, Other needs a note, note length cap, double mark',
    async () => {
      const eventId = await mkEvent('valid');
      assert.equal((await mark(admin, eventId, 'bogus')).success, false);
      assert.equal((await mark(admin, eventId, 'other')).success, false);
      assert.equal((await mark(admin, eventId, 'other', '   ')).success, false);
      assert.equal((await mark(admin, eventId, 'not_needed', 'x'.repeat(501))).success, false);
      assert.equal((await mark(admin, eventId, 'other', 'Granted by phone')).success, true);
      const again = await mark(admin, eventId, 'not_needed');
      assert.equal(again.success, false);
      assert.match(again.error ?? '', /already marked/);
      assert.equal((await logRows(eventId)).length, 1);
    }
  );

  await check('ended events: mark and reopen are blocked (Mountain time)', async () => {
    const pastId = await mkEvent('past', { date: yesterday, start: '10:00', end: '12:00' });
    const r = await mark(admin, pastId);
    assert.equal(r.success, false);
    assert.match(r.error ?? '', /already ended/);
    // An event that was marked and then ended cannot be reopened either.
    await db
      .update(events)
      .set({ manualHandledAt: new Date(), manualReason: 'not_needed' })
      .where(eq(events.id, pastId));
    const o = await mo.reopenEventForAutomationForAccess(admin, { eventId: pastId });
    assert.equal(o.success, false);
    assert.match(o.error ?? '', /already ended/);
    assert.notEqual((await getEvent(pastId)).manualHandledAt, null, 'flag untouched');
  });

  await check('eventEndsInFuture boundary uses Mountain time', async () => {
    assert.equal(sched.eventEndsInFuture(tomorrow, '00:01'), true);
    assert.equal(sched.eventEndsInFuture(yesterday, '23:59'), false);
    assert.equal(sched.eventEndsInFuture(now.ymd, now.hm), true, 'ends this minute still counts');
  });

  // ── 3. Prior automation state for every case ────────────────────────────────
  const priorCases: {
    name: string;
    setup: () => Promise<string>;
    expect: (p: Awaited<ReturnType<typeof mo.snapshotAutomationState>>) => void;
    line: RegExp;
  }[] = [
    {
      name: 'no job yet',
      setup: () => mkEvent('p-nojob'),
      expect: (p) => assert.equal(p.job, null),
      line: /No automation run yet/,
    },
    {
      name: 'queued',
      setup: async () => {
        const e = await mkEvent('p-queued');
        await mkJob('p-queued-j', e, 'queued');
        return e;
      },
      expect: (p) => assert.equal(p.job?.status, 'queued'),
      line: /was queued, not started/,
    },
    {
      name: 'processing',
      setup: async () => {
        const e = await mkEvent('p-proc');
        await mkJob('p-proc-j', e, 'processing');
        return e;
      },
      expect: (p) => assert.equal(p.job?.status, 'processing'),
      line: /in progress \(claimed/,
    },
    {
      name: 'failed',
      setup: async () => {
        const e = await mkEvent('p-failed');
        await mkJob('p-failed-j', e, 'failed', { lastError: 'Kindoo timed out.' });
        return e;
      },
      expect: (p) => assert.equal(p.job?.status, 'failed'),
      line: /had failed: Kindoo timed out\./,
    },
    {
      name: 'already granted',
      setup: async () => {
        const e = await mkEvent('p-granted', { licenseCreated: true });
        await mkJob('p-granted-j', e, 'completed', {
          completionType: 'temporary-license-created',
          completedAt: new Date(),
        });
        return e;
      },
      expect: (p) => {
        assert.equal(p.job?.status, 'completed');
        assert.equal(p.licenseCreated, true);
      },
      line: /Worker had already granted door access at .* \(temporary door access created\)/,
    },
    {
      name: 'door access already existed',
      setup: async () => {
        const e = await mkEvent('p-existing', { licenseCreated: true });
        await mkJob('p-existing-j', e, 'completed', {
          completionType: 'existing-active-license',
          completedAt: new Date(),
        });
        return e;
      },
      expect: (p) => assert.equal(p.job?.completionType, 'existing-active-license'),
      line: /door access already in place/,
    },
  ];
  for (const c of priorCases) {
    await check(
      `mark records prior state, audit line and reopen restores it: ${c.name}`,
      async () => {
        const eventId = await c.setup();
        const before = await mo.snapshotAutomationState(eventId);
        c.expect(before);
        const r = await mark(admin, eventId, 'granted_directly', 'Did it in the Kindoo admin');
        assert.equal(r.success, true, r.error);
        const ev = await getEvent(eventId);
        assert.ok(ev.manualHandledAt);
        assert.equal(ev.manualHandledByUserId, admin.userId);
        assert.equal(ev.manualReason, 'granted_directly');

        const audit = (await mo.getManualOverrideAuditForAccess(admin, { eventId })).data!;
        assert.equal(audit.handled, true);
        assert.equal(audit.handledByName, 'admin Person');
        assert.equal(audit.note, 'Did it in the Kindoo admin');
        c.expect(audit.prior!);
        const line = fmt.buildAuditLine(audit, new Date());
        assert.match(
          line,
          /^Handled manually by admin Person, .+ (AM|PM) [A-Z]{2,5}, granted directly in Kindoo\. Note: Did it/
        );
        assert.match(fmt.describePriorAutomation(audit.prior) ?? '', c.line);

        // Automation state is untouched by the mark.
        assert.deepEqual(await mo.snapshotAutomationState(eventId), before);

        const reopened = await mo.reopenEventForAutomationForAccess(admin, { eventId });
        assert.equal(reopened.success, true, reopened.error);
        const after = await getEvent(eventId);
        assert.equal(after.manualHandledAt, null);
        assert.equal(after.manualReason, null);
        assert.equal(after.manualNote, null);
        assert.equal(after.manualHandledByUserId, null);
        assert.deepEqual(
          await mo.snapshotAutomationState(eventId),
          before,
          'reopen restores the automation state'
        );
        const rows = await logRows(eventId);
        assert.deepEqual(rows.map((row) => row.action).sort(), ['marked', 'reopened']);
      }
    );
  }

  await check('reopen previews: what the worker will do next', async () => {
    const cases: [string, string, RegExp][] = [
      ['p-queued', 'will-run-next-cycle', /queued automation job/],
      ['p-proc', 'will-run-next-cycle', /in progress/],
      ['p-failed', 'no-automatic-action', /Nothing runs automatically/],
      ['p-granted', 'no-automatic-action', /already ran/],
      ['p-nojob', 'will-queue-when-due', /when it is due/],
    ];
    for (const [name, outlook, re] of cases) {
      const p = await mo.previewReopenForAccess(admin, { eventId: id(name) });
      assert.equal(p.data?.outlook, outlook, name);
      assert.match(p.data?.message ?? '', re, name);
    }
  });

  await check('reopen when not marked is rejected', async () => {
    const r = await mo.reopenEventForAutomationForAccess(admin, { eventId: id('p-nojob') });
    assert.equal(r.success, false);
  });

  // ── 4. Audit visibility by role ──────────────────────────────────────────────
  await check(
    'audit: ward manager sees the line without the note; other ward sees nothing; admin sees history',
    async () => {
      const eventId = await mkEvent('audit');
      assert.equal((await mark(admin, eventId, 'other', 'Private remark')).success, true);
      const asAdmin = (await mo.getManualOverrideAuditForAccess(admin, { eventId })).data!;
      assert.equal(asAdmin.note, 'Private remark');
      assert.equal(asAdmin.history.length, 1);
      const asStake = (await mo.getManualOverrideAuditForAccess(stake, { eventId })).data!;
      assert.equal(asStake.note, 'Private remark');
      const asWard = (await mo.getManualOverrideAuditForAccess(wardMgr, { eventId })).data!;
      assert.equal(asWard.handled, true);
      assert.equal(asWard.note, null);
      assert.deepEqual(asWard.history, []);
      assert.equal(fmt.buildAuditLine(asWard).includes('Private remark'), false);
      const asOtherWard = await mo.getManualOverrideAuditForAccess(otherWardMgr, { eventId });
      assert.equal(asOtherWard.success, false);
    }
  );

  // ── 5. Worker guards ─────────────────────────────────────────────────────────
  await check(
    'claim skips a flagged event that has a queued job, and still claims unflagged ones',
    async () => {
      const flaggedEvent = await mkEvent('c-flagged');
      const flaggedJob = await mkJob('c-flagged-j', flaggedEvent, 'queued');
      const freeEvent = await mkEvent('c-free');
      const freeJob = await mkJob('c-free-j', freeEvent, 'queued');
      assert.equal((await mark(admin, flaggedEvent)).success, true);
      const claimed = (await claimAll()).jobs.map((j) => j.id);
      assert.ok(!claimed.includes(flaggedJob), 'flagged job must not be claimed');
      assert.ok(claimed.includes(freeJob), 'unflagged job is claimed');
      assert.equal((await getJob(flaggedJob)).status, 'queued');
      assert.equal((await getJob(freeJob)).status, 'processing');
    }
  );

  await check(
    'claim skips a flagged event that was already granted (stray queued job)',
    async () => {
      const eventId = await mkEvent('c-granted', { licenseCreated: true });
      await mkJob('c-granted-done', eventId, 'completed', {
        completionType: 'temporary-license-created',
        completedAt: new Date(),
      });
      assert.equal((await mark(admin, eventId)).success, true);
      const stray = await mkJob('c-granted-stray', eventId, 'queued');
      const claimed = (await claimAll()).jobs.map((j) => j.id);
      assert.ok(!claimed.includes(stray));
      assert.equal((await getJob(stray)).status, 'queued');
    }
  );

  await check(
    'claim UPDATE guard: a mark made after the candidate select still blocks the claim',
    async () => {
      const eventId = await mkEvent('c-race');
      const jobId = await mkJob('c-race-j', eventId, 'queued');
      assert.equal((await mark(admin, eventId)).success, true);
      // Same predicate as the claim UPDATE, used as if the candidate select had already returned this job.
      const claimed = await db
        .update(kindooLicenseJobs)
        .set({ status: 'processing' })
        .where(
          and(
            eq(kindooLicenseJobs.id, jobId),
            eq(kindooLicenseJobs.status, 'queued'),
            sql`${kindooLicenseJobs.eventId} not in (select id from event where manual_handled_at is not null)`
          )
        )
        .returning({ id: kindooLicenseJobs.id });
      assert.equal(claimed.length, 0);
      assert.equal((await getJob(jobId)).status, 'queued');
    }
  );

  await check('claim picks the job up again after reopen', async () => {
    const eventId = id('c-flagged');
    assert.equal((await mo.reopenEventForAutomationForAccess(admin, { eventId })).success, true);
    const claimed = (await claimAll()).jobs.map((j) => j.id);
    assert.ok(claimed.includes(id('c-flagged-j')));
  });

  await check(
    'schedule-due does not queue a flagged event with no job, and queues it after reopen',
    async () => {
      if (now.hm < '03:30') {
        console.log('      (skipped: nothing is due before 03:00 Mountain)');
        return;
      }
      const nowMin = Number(now.hm.slice(0, 2)) * 60 + Number(now.hm.slice(3));
      const hm = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      const eventId = await mkEvent('s-due', {
        date: now.ymd,
        start: hm(Math.max(0, nowMin - 60)),
        end: hm(Math.min(23 * 60 + 59, nowMin + 120)),
      });
      assert.equal((await mark(admin, eventId)).success, true);
      const run = async () =>
        (await (await scheduleRoute.POST(post('/api/license-jobs/schedule-due'))).json()) as {
          queued: { eventId: string }[];
        };
      assert.ok(!(await run()).queued.some((q) => q.eventId === eventId));
      assert.equal(
        (await db.select().from(kindooLicenseJobs).where(eq(kindooLicenseJobs.eventId, eventId)))
          .length,
        0
      );
      const preview = await mo.previewReopenForAccess(admin, { eventId });
      assert.equal(preview.data?.outlook, 'will-run-next-cycle');
      assert.equal((await mo.reopenEventForAutomationForAccess(admin, { eventId })).success, true);
      assert.ok(
        (await run()).queued.some((q) => q.eventId === eventId),
        'queued after reopen'
      );
    }
  );

  await check(
    'start (pre-run check): proceeds when not flagged, stands down and re-queues when flagged',
    async () => {
      const eventId = await mkEvent('st');
      const jobId = await mkJob('st-j', eventId, 'processing');
      const ok = await (
        await startRoute.POST(post(`/api/license-jobs/${jobId}/start`), {
          params: Promise.resolve({ jobId }),
        })
      ).json();
      assert.deepEqual({ proceed: ok.proceed }, { proceed: true });
      assert.equal((await getJob(jobId)).status, 'processing');

      assert.equal((await mark(admin, eventId)).success, true);
      const stop = await (
        await startRoute.POST(post(`/api/license-jobs/${jobId}/start`), {
          params: Promise.resolve({ jobId }),
        })
      ).json();
      assert.equal(stop.proceed, false);
      assert.equal(stop.reason, 'handled-manually');
      const job = await getJob(jobId);
      assert.equal(job.status, 'queued');
      assert.equal(job.workerId, null);
      assert.equal(job.attempts, 0, 'attempt is not counted for a run that never started');
      assert.ok(!(await claimAll()).jobs.some((j) => j.id === jobId), 'not claimed while flagged');

      const notProcessing = await (
        await startRoute.POST(post(`/api/license-jobs/${jobId}/start`), {
          params: Promise.resolve({ jobId }),
        })
      ).json();
      assert.equal(notProcessing.reason, 'not-processing');
      const missing = await (
        await startRoute.POST(post('/api/license-jobs/nope/start'), {
          params: Promise.resolve({ jobId: 'nope' }),
        })
      ).json();
      assert.equal(missing.proceed, false);
    }
  );

  await check('start rejects a bad worker token', async () => {
    const res = await startRoute.POST(
      new Request('http://localhost/x', { method: 'POST', headers: { 'x-worker-token': 'wrong' } }),
      { params: Promise.resolve({ jobId: 'x' }) }
    );
    assert.equal(res.status, 401);
  });

  // ── 6. Late worker results on a flagged event ────────────────────────────────
  await check(
    'late complete on a flagged event: job recorded, no event flag, no SMS, log row, 200',
    async () => {
      const eventId = await mkEvent('late-c');
      const jobId = await mkJob('late-c-j', eventId, 'processing');
      assert.equal((await mark(admin, eventId, 'worker_offline')).success, true);
      const before = await outboxCount();
      const res = await completeRoute.POST(
        post(`/api/license-jobs/${jobId}/complete`, {
          completionType: 'temporary-license-created',
        }),
        { params: Promise.resolve({ jobId }) }
      );
      assert.equal(res.status, 200);
      const job = await getJob(jobId);
      assert.equal(job.status, 'completed');
      assert.equal(job.completionType, 'temporary-license-created');
      const ev = await getEvent(eventId);
      assert.equal(ev.kindooLicenseCreated, false, 'event license flag untouched');
      assert.ok(ev.manualHandledAt, 'override untouched');
      assert.equal(await outboxCount(), before, 'no SMS attempted');
      const late = (await logRows(eventId)).filter(
        (r) => r.action === 'worker_result_after_override'
      );
      assert.equal(late.length, 1);
      const audit = (await mo.getManualOverrideAuditForAccess(admin, { eventId })).data!;
      assert.equal(audit.lateWorkerResults.length, 1);
      assert.match(fmt.describeLateWorkerResult(audit.lateWorkerResults[0]), /created door access/);
    }
  );

  await check('late fail on a flagged event: job recorded, no SMS, log row, 200', async () => {
    const eventId = await mkEvent('late-f');
    const jobId = await mkJob('late-f-j', eventId, 'processing');
    assert.equal((await mark(admin, eventId)).success, true);
    const before = await outboxCount();
    const res = await failRoute.POST(
      post(`/api/license-jobs/${jobId}/fail`, { details: 'Kindoo said no' }),
      {
        params: Promise.resolve({ jobId }),
      }
    );
    assert.equal(res.status, 200);
    assert.equal((await getJob(jobId)).status, 'failed');
    assert.equal(await outboxCount(), before);
    const late = (await logRows(eventId)).filter(
      (r) => r.action === 'worker_result_after_override'
    );
    assert.equal(late.length, 1);
    assert.match(String(late[0].details), /Kindoo said no/);
  });

  await check(
    'control: complete and fail on an UNflagged event still set the flag and attempt SMS',
    async () => {
      const eventId = await mkEvent('ctl-c');
      const jobId = await mkJob('ctl-c-j', eventId, 'processing');
      const before = await outboxCount();
      const res = await completeRoute.POST(
        post(`/api/license-jobs/${jobId}/complete`, {
          completionType: 'temporary-license-created',
        }),
        { params: Promise.resolve({ jobId }) }
      );
      assert.equal(res.status, 200);
      assert.equal((await getEvent(eventId)).kindooLicenseCreated, true);
      assert.equal(
        await outboxCount(),
        before + 1,
        'completion SMS attempted (fails locally: no provider)'
      );
      assert.equal((await logRows(eventId)).length, 0);

      const failEvent = await mkEvent('ctl-f');
      const failJob = await mkJob('ctl-f-j', failEvent, 'processing');
      const b2 = await outboxCount();
      await failRoute.POST(post(`/api/license-jobs/${failJob}/fail`, { details: 'boom' }), {
        params: Promise.resolve({ jobId: failJob }),
      });
      assert.equal(await outboxCount(), b2 + 1);
    }
  );

  // ── 6b. Texts on mark and reopen ─────────────────────────────────────────────
  // Recipients use the existing opt-in rules. The provider is faked: no network, no real text.
  const providerCalls = fakeTwilio.calls;
  setSmsEnv(true);
  const configured = {};
  const enableSms = async (who: { userId: string }, phone: string, eventCreated: boolean) => {
    await db
      .delete(schema.notificationPreferences)
      .where(eq(schema.notificationPreferences.userId, who.userId));
    await db.insert(schema.notificationPreferences).values({
      userId: who.userId,
      smsEnabled: true,
      smsPhone: phone,
      eventCreatedSms: eventCreated,
    });
  };
  // Creator (wardUser) is already opted in for the "access ready" text. Stake manager opted in to
  // "new booking" texts. The 1st ward manager did not. The 3rd ward manager did, but is another ward.
  await enableSms(stake, '5555550141', true);
  await enableSms(wardMgr, '5555550142', false);
  await enableSms(otherWardMgr, '5555550143', true);
  await enableSms(admin, '5555550144', true);
  const textedNumbers = () => providerCalls.map((c) => c.to).sort();

  await check('mark texts the creator and the opted-in event audience, nobody else', async () => {
    providerCalls.length = 0;
    const eventId = await mkEvent('sms-mark');
    const r = await mo.markEventHandledManuallyForAccess(
      admin,
      { eventId, reason: 'granted_directly', note: 'Secret admin note about Bob' },
      configured
    );
    assert.equal(r.success, true);
    // creator +15555550123, stake manager +15555550141. Not the actor (admin), not the opted-out
    // ward manager, not the other ward's manager.
    assert.deepEqual(textedNumbers(), ['+15555550123', '+15555550141']);
    const data = (r as { data: { sms: { sent: number; attempted: number; skipped: number } } })
      .data;
    assert.equal(data.sms.sent, 2);
    assert.ok(
      data.sms.skipped >= 1,
      'opted-out users are skipped by the existing opt-in rules (the ward manager at least)'
    );
    const rows = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.status, 'sent'));
    assert.ok(
      rows.some(
        (o) => o.recipientUserId === wardUser.userId && o.eventKey === 'license_job_completed'
      )
    );
    assert.ok(
      rows.some((o) => o.recipientUserId === stake.userId && o.eventKey === 'event_created')
    );
  });

  await check(
    'mark text has event detail, reason wording, no note, admin name, link or em dash',
    async () => {
      providerCalls.length = 0;
      const eventId = await mkEvent('sms-content');
      const reasons = {
        worker_offline: /automation was unavailable/,
        granted_directly: /granted directly in Kindoo/,
        not_needed: /not needed for this event/,
        other: /handled by hand/,
      } as const;
      for (const [reason, pattern] of Object.entries(reasons)) {
        providerCalls.length = 0;
        const id2 = await mkEvent(`sms-content-${reason}`);
        const r = await mo.markEventHandledManuallyForAccess(
          admin,
          { eventId: id2, reason, note: 'Secret admin note about Bob' },
          configured
        );
        assert.equal(r.success, true);
        const body = providerCalls[0].body;
        assert.match(body, pattern, reason);
        assert.match(
          body,
          reason === 'not_needed'
            ? /^DigitalFob: No door access needed/
            : /^DigitalFob: Door access is taken care of/
        );
        assert.match(body, /Nothing needed from you/);
        assert.match(body, /Where: Stake Center/);
        assert.match(body, /For: Check Contact, 1st Ward/);
        assert.match(body, /When: .* MT/);
        assert.equal(body.includes('Secret admin note'), false);
        assert.equal(body.includes('admin Person'), false, 'actor name not included');
        assert.equal(/https?:\/\/|www\./.test(body), false);
        assert.equal(/[\u2013\u2014\u2026\u201C\u201D]/.test(body), false);
        assert.ok(body.split('\n').length >= 5, 'multi-line');
        assert.equal(
          new Set(providerCalls.map((c) => c.body)).size,
          1,
          'same text for all recipients'
        );
        assert.ok(body.length <= 306);
      }
      void eventId;
    }
  );

  await check('log records that a text went out and to how many people', async () => {
    providerCalls.length = 0;
    const eventId = await mkEvent('sms-log');
    setSmsEnv(false);
    await mark(admin, eventId, 'granted_directly');
    setSmsEnv(true);
    const logged = (await logRows(eventId)).find((l) => l.action === 'marked');
    assert.ok(logged);
    // no deps: default sender; SMS is not configured in this script, so it is skipped and logged as such
    assert.equal(JSON.parse(logged!.details!).sms.skippedReason, 'sms-not-configured');
    await mo.reopenEventForAutomationForAccess(admin, { eventId }, configured);
    const eventId2 = await mkEvent('sms-log2');
    await mo.markEventHandledManuallyForAccess(
      admin,
      { eventId: eventId2, reason: 'not_needed' },
      configured
    );
    const logged2 = (await logRows(eventId2)).find((l) => l.action === 'marked');
    const sms = JSON.parse(logged2!.details!).sms;
    assert.equal(sms.sent, 2);
    assert.ok(sms.attempted >= 3 && sms.attempted === sms.sent + sms.skipped + sms.failed);
    assert.ok(JSON.parse(logged2!.details!).automation, 'prior automation state is still logged');
  });

  await check(
    'reopen sends a correction text only after a mark text went out, calm and accurate',
    async () => {
      providerCalls.length = 0;
      const eventId = await mkEvent('sms-reopen');
      await mo.markEventHandledManuallyForAccess(
        admin,
        { eventId, reason: 'worker_offline' },
        configured
      );
      providerCalls.length = 0;
      const r = await mo.reopenEventForAutomationForAccess(admin, { eventId }, configured);
      assert.equal(r.success, true);
      assert.deepEqual(textedNumbers(), ['+15555550123', '+15555550141']);
      const body = providerCalls[0].body;
      assert.match(body, /^DigitalFob: Correction, door access is automatic/);
      assert.match(body, /disregard our earlier text/);
      assert.match(body, /Nothing needed from you/);
      assert.match(body, /about 4 hours before the event/);
      assert.match(body, /Where: Stake Center/);
      assert.equal(/https?:\/\/|www\./.test(body), false);
      assert.equal(/[\u2013\u2014\u2026\u201C\u201D]/.test(body), false);
      const reopened = (await logRows(eventId)).find((l) => l.action === 'reopened');
      assert.equal(JSON.parse(reopened!.details!).sms.sent, 2);
    }
  );

  await check(
    'no correction text when the mark text was never sent (sms off, or nobody subscribed)',
    async () => {
      // mark with SMS not configured (default deps in this script)
      const eventId = await mkEvent('sms-reopen-none');
      setSmsEnv(false);
      await mark(admin, eventId);
      setSmsEnv(true);
      providerCalls.length = 0;
      const r = await mo.reopenEventForAutomationForAccess(admin, { eventId }, configured);
      assert.equal(r.success, true);
      assert.equal(providerCalls.length, 0);
      assert.equal((r as { data: { sms: unknown } }).data.sms, null);
      // mark when the provider fails for everyone: sent is 0, so no correction either
      fakeTwilio.mode = 'fail';
      const eventId2 = await mkEvent('sms-reopen-failed');
      await mo.markEventHandledManuallyForAccess(
        admin,
        { eventId: eventId2, reason: 'other', note: 'x' },
        configured
      );
      fakeTwilio.mode = 'ok';
      providerCalls.length = 0;
      await mo.reopenEventForAutomationForAccess(admin, { eventId: eventId2 }, configured);
      assert.equal(providerCalls.length, 0);
    }
  );

  await check(
    'a text failure or provider exception never blocks the mark or the reopen',
    async () => {
      for (const mode of ['fail', 'throw'] as const) {
        fakeTwilio.mode = mode;
        const eventId = await mkEvent(`sms-fail-${mode}`);
        const r = await mo.markEventHandledManuallyForAccess(
          admin,
          { eventId, reason: 'granted_directly' },
          configured
        );
        assert.equal(r.success, true, mode);
        assert.ok((await getEvent(eventId)).manualHandledAt, 'flag is set');
        const sms = (r as { data: { sms: { sent: number; failed: number } } }).data.sms;
        assert.equal(sms.sent, 0);
        assert.ok(sms.failed >= 1, mode);
      }
      fakeTwilio.mode = 'ok';
      // a sender that throws outright is also contained
      const eventId = await mkEvent('sms-throw-hard');
      const r = await mo.markEventHandledManuallyForAccess(
        admin,
        { eventId, reason: 'granted_directly' },
        {
          isSmsConfigured: () => true,
          sendSms: async () => {
            throw new Error('boom');
          },
        }
      );
      assert.equal(r.success, true);
      assert.ok((await getEvent(eventId)).manualHandledAt);
    }
  );

  await check('creator who is the acting admin is not texted about their own change', async () => {
    providerCalls.length = 0;
    const eventId = id('sms-own');
    await db.insert(events).values({
      id: eventId,
      building: 'Stake Center',
      eventDate: tomorrow,
      startTime: '18:00',
      endTime: '20:00',
      contactId,
      description: 'own',
      eventType: 'Ward',
      userId: admin.userId,
    });
    await mo.markEventHandledManuallyForAccess(
      admin,
      { eventId, reason: 'other', note: 'x' },
      configured
    );
    assert.deepEqual(
      textedNumbers(),
      ['+15555550141'],
      'creator-admin skipped, audience still texted'
    );
  });

  await check('non-admin and ended-event attempts send no text', async () => {
    providerCalls.length = 0;
    const eventId = await mkEvent('sms-denied');
    assert.equal(
      (
        await mo.markEventHandledManuallyForAccess(
          stake,
          { eventId, reason: 'not_needed' },
          configured
        )
      ).success,
      false
    );
    const ended = await mkEvent('sms-ended', { date: yesterday });
    assert.equal(
      (
        await mo.markEventHandledManuallyForAccess(
          admin,
          { eventId: ended, reason: 'not_needed' },
          configured
        )
      ).success,
      false
    );
    assert.equal(providerCalls.length, 0);
  });

  await check(
    'new templates: link-free, GSM-safe, within 2 segments even with long input',
    async () => {
      const t = await import('../src/lib/sms-message-templates');
      const long = {
        description: 'Youth Activity Night with a really very long description here',
        eventType: 'Ward',
        eventDate: '2026-10-17',
        startTime: '18:00',
        endTime: '21:00',
        building: 'Maples Building Annex',
        ward: 'Park Ridge Ward',
        contactName: 'Jane Smith-Johnson',
        contactPhone: null,
      };
      for (const reason of ['worker_offline', 'granted_directly', 'not_needed', 'other'] as const) {
        const body = t.buildEventHandledManuallySms({ ...long, reason });
        assert.ok(t.gsmLength(body) <= 306, reason);
        assert.equal(/[\u2013\u2014\u2026\u201C\u201D]/.test(body), false);
      }
      assert.ok(t.gsmLength(t.buildEventHandledManuallyReopenedSms(long)) <= 306);
    }
  );

  setSmsEnv(false);

  // ── 7. Filter and counts ─────────────────────────────────────────────────────
  await check('status filter predicates and dashboard handled bucket', async () => {
    const mk = (handled: boolean, licenseCreated: boolean) => ({
      manualHandledAt: handled ? new Date() : null,
      kindooLicenseCreated: licenseCreated,
    });
    assert.equal(utils.matchesEventStatusFilter(mk(true, false), 'handled'), true);
    assert.equal(utils.matchesEventStatusFilter(mk(true, true), 'handled'), true);
    assert.equal(utils.matchesEventStatusFilter(mk(false, true), 'handled'), false);
    assert.equal(utils.matchesEventStatusFilter(mk(false, true), 'automated'), true);
    assert.equal(utils.matchesEventStatusFilter(mk(true, true), 'automated'), false);
    assert.equal(utils.matchesEventStatusFilter(mk(false, false), 'not-yet-handled'), true);
    assert.equal(utils.matchesEventStatusFilter(mk(true, false), 'not-yet-handled'), false);
    for (const f of utils.EVENT_STATUS_FILTERS)
      assert.equal(utils.matchesEventStatusFilter(mk(true, true), f) || f !== 'all', true);

    const list = await db.select().from(events).where(eq(events.contactId, contactId));
    const withMeta = list.map((e) => ({
      ...e,
      creatorName: null,
      creatorEmail: null,
      creatorRole: null,
      contactName: 'x',
      contactWard: '1st Ward' as const,
      contactOtherWardName: null,
      contactEmail: null,
      contactPhone: null,
    }));
    const counts = utils.buildDashboardCounts(withMeta as never, []);
    const flagged = list.filter((e) => e.manualHandledAt && e.eventDate >= now.ymd).length;
    assert.equal(counts.handledManually.stake, flagged);
    assert.ok(flagged > 0);
    assert.equal(counts.pendingLicense.total >= 0, true);
  });

  await check('format helpers: audit line shape and local time zone label', async () => {
    const line = fmt.buildAuditLine(
      {
        handledAt: new Date('2026-10-24T11:02:00Z').toISOString(),
        handledByName: 'Spencer',
        reason: 'worker_offline',
        note: null,
      },
      new Date('2026-10-24T12:00:00Z')
    );
    assert.match(
      line,
      /^Handled manually by Spencer, Oct 24, \d{1,2}:02 (AM|PM) [A-Z]{2,5}, worker offline$/
    );
    assert.equal(line.includes('\u2014'), false);
    const nextYear = fmt.formatOverrideTimestamp(
      '2027-01-05T18:00:00Z',
      new Date('2026-10-24T12:00:00Z')
    );
    assert.match(nextYear, /2027/);
  });

  // ── 7. Audience: each person at most once ───────────────────────────────────
  await check('mark text: creator who is also in the audience is texted exactly once', async () => {
    providerCalls.length = 0;
    setSmsEnv(true);
    // The creator is a ward manager of the event's ward, opted in to "new booking" texts as well as
    // "access ready" texts. They are in both groups but must receive one text.
    await enableSms(wardMgr, '5555550142', true);
    const eventId = id('sms-dedupe');
    await db.insert(events).values({
      id: eventId,
      building: 'Stake Center',
      eventDate: tomorrow,
      startTime: '18:00',
      endTime: '20:00',
      contactId,
      description: 'dedupe',
      eventType: 'Ward',
      userId: wardMgr.userId,
    });
    const r = await mo.markEventHandledManuallyForAccess(
      admin,
      { eventId, reason: 'worker_offline' },
      configured
    );
    assert.equal(r.success, true);
    const texted = textedNumbers();
    assert.equal(new Set(texted).size, texted.length, 'no number texted twice');
    assert.equal(texted.filter((n) => n === '+15555550142').length, 1, 'creator texted once');
    assert.ok(texted.includes('+15555550141'), 'stake manager (audience) texted');
    assert.equal(texted.includes('+15555550144'), false, 'acting admin not texted');
    assert.equal(texted.includes('+15555550143'), false, 'other ward manager not texted');
    await enableSms(wardMgr, '5555550142', false);
  });

  // ── 8. Worker heartbeat carries the worker's interval ────────────────────────
  const health = await import('../src/lib/license-worker-health');
  const heartbeatRoute = await import('../src/app/api/license-jobs/heartbeat/route');
  const beat = async (workerId: string, body: Record<string, unknown>) => {
    const res = await heartbeatRoute.POST(
      new Request('http://localhost/api/license-jobs/heartbeat', {
        method: 'POST',
        headers: { ...workerHeaders, 'x-worker-id': workerId, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    assert.equal(res.status, 200);
  };
  const storedInterval = async (workerId: string) =>
    (
      await db
        .select({ v: schema.licenseWorkerHeartbeats.intervalMs })
        .from(schema.licenseWorkerHeartbeats)
        .where(eq(schema.licenseWorkerHeartbeats.workerId, workerId))
    )[0].v;
  const setLastSeen = (workerId: string, ageMs: number) =>
    db
      .update(schema.licenseWorkerHeartbeats)
      .set({ lastSeenAt: new Date(Date.now() - ageMs) })
      .where(eq(schema.licenseWorkerHeartbeats.workerId, workerId));
  const MIN = 60_000;
  const hbId = id('hb-worker');
  const savedEnvInterval = process.env.KINDOO_WORKER_INTERVAL_MS;

  await check('heartbeat stores the interval the worker reports', async () => {
    await beat(hbId, { mode: 'watch', host: 'check-host', intervalMs: 600_000 });
    assert.equal(await storedInterval(hbId), 600_000);
    await beat(hbId, { mode: 'watch', host: 'check-host', intervalMs: 300_000 });
    assert.equal(await storedInterval(hbId), 300_000, 'the latest heartbeat wins');
  });

  await check('heartbeat interval is validated: bounds, integers and types', async () => {
    const s = health.sanitizeWorkerIntervalMs;
    assert.equal(s(5_000), 5_000);
    assert.equal(s(3_600_000), 3_600_000);
    assert.equal(s(4_999), null, 'below 5 seconds');
    assert.equal(s(3_600_001), null, 'above 1 hour');
    assert.equal(s(0), null);
    assert.equal(s(-600_000), null);
    assert.equal(s(600_000.5), null, 'not an integer');
    assert.equal(s(Number.NaN), null);
    assert.equal(s(Number.POSITIVE_INFINITY), null);
    assert.equal(s('600000'), null, 'strings are ignored');
    assert.equal(s(null), null);
    assert.equal(s(undefined), null);
    assert.equal(s({}), null);
    for (const bad of [1, 4_999, 3_600_001, 1e12, -5, 12.5, 'abc', null, true]) {
      await beat(hbId, { mode: 'watch', intervalMs: bad });
      assert.equal(await storedInterval(hbId), null, `invalid value ${String(bad)} is not stored`);
    }
  });

  await check(
    'health thresholds come from the stored interval (1.5x + 5 min, 4x + 10 min)',
    async () => {
      const t = health.computeWorkerThresholds(600_000, 'worker');
      assert.equal(t.healthyThresholdMs, 900_000 + 5 * MIN);
      assert.equal(t.staleThresholdMs, 2_400_000 + 10 * MIN);
      const small = health.computeWorkerThresholds(5_000, 'worker');
      assert.equal(small.healthyThresholdMs, 7_500 + 5 * MIN);
      assert.equal(small.staleThresholdMs, 20_000 + 10 * MIN);

      // The Mac worker: a 10 minute interval, vercel env says 1 minute. Stored value must win.
      process.env.KINDOO_WORKER_INTERVAL_MS = '60000';
      await beat(hbId, { mode: 'watch', intervalMs: 600_000 });
      // 18 minutes since the heartbeat started the last cycle: old rule would say "down" (> 4 min).
      await setLastSeen(hbId, 18 * MIN);
      let h = await health.getWorkerHealth();
      assert.equal(h.workerId, hbId);
      assert.equal(h.intervalMs, 600_000);
      assert.equal(h.intervalSource, 'worker');
      assert.equal(h.healthyThresholdMs, 20 * MIN);
      assert.equal(h.staleThresholdMs, 50 * MIN);
      assert.equal(h.status, 'healthy', '18 min < 20 min healthy threshold');
      await setLastSeen(hbId, 21 * MIN);
      assert.equal((await health.getWorkerHealth()).status, 'stale');
      await setLastSeen(hbId, 49 * MIN);
      assert.equal((await health.getWorkerHealth()).status, 'stale');
      await setLastSeen(hbId, 51 * MIN);
      assert.equal((await health.getWorkerHealth()).status, 'down');
      await setLastSeen(hbId, 0);
      h = await health.getWorkerHealth();
      assert.equal(h.status, 'healthy');
      assert.equal(
        await health.getEffectiveWorkerPollIntervalMs(),
        600_000,
        'routes use the stored value'
      );
    }
  );

  await check(
    'old worker without intervalMs: falls back to the env interval, legacy thresholds',
    async () => {
      await beat(hbId, { mode: 'watch', host: 'old-worker' });
      assert.equal(await storedInterval(hbId), null);

      process.env.KINDOO_WORKER_INTERVAL_MS = '120000';
      const legacy = health.computeWorkerThresholds(120_000, 'env');
      assert.equal(legacy.healthyThresholdMs, 180_000);
      assert.equal(legacy.staleThresholdMs, 480_000);
      let h = await health.getWorkerHealth();
      assert.equal(h.intervalSource, 'env');
      assert.equal(h.intervalMs, 120_000);
      assert.equal(h.healthyThresholdMs, 180_000);
      assert.equal(h.staleThresholdMs, 480_000);
      assert.equal(h.status, 'healthy');
      assert.equal(await health.getEffectiveWorkerPollIntervalMs(), 120_000);
      await setLastSeen(hbId, 5 * MIN);
      assert.equal((await health.getWorkerHealth()).status, 'stale');
      await setLastSeen(hbId, 9 * MIN);
      assert.equal((await health.getWorkerHealth()).status, 'down');

      delete process.env.KINDOO_WORKER_INTERVAL_MS;
      assert.equal(health.getEnvWorkerPollIntervalMs(), 60_000, 'default is 60 seconds');
      process.env.KINDOO_WORKER_INTERVAL_MS = '100';
      assert.equal(health.getEnvWorkerPollIntervalMs(), 5_000, 'env value is clamped to 5 seconds');
      process.env.KINDOO_WORKER_INTERVAL_MS = 'nonsense';
      assert.equal(health.getEnvWorkerPollIntervalMs(), 60_000);
      await setLastSeen(hbId, 0);
      h = await health.getWorkerHealth();
      assert.equal(h.intervalSource, 'env');
    }
  );

  await check('the freshest heartbeat decides when several workers report', async () => {
    const other = id('hb-worker2');
    await beat(other, { mode: 'watch', intervalMs: 30_000 });
    await setLastSeen(hbId, 10 * MIN);
    const h = await health.getWorkerHealth();
    assert.equal(h.workerId, other);
    assert.equal(h.intervalMs, 30_000);
    assert.equal(await health.getEffectiveWorkerPollIntervalMs(), 30_000);
  });
  if (savedEnvInterval === undefined) delete process.env.KINDOO_WORKER_INTERVAL_MS;
  else process.env.KINDOO_WORKER_INTERVAL_MS = savedEnvInterval;

  // ── Summary ──────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    for (const f of failed) console.log(` - ${f.name}: ${f.error}`);
    process.exit(1);
  }
}

void main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
