// Scripted check for the SMS wording rewrite and its recipient changes. It renders every
// template, then runs the real send paths against a LOCAL SQLite file with a fake Twilio
// client, so no text can leave this machine and no remote database is touched.
//
// Prepare a throwaway copy of a dev database (schema through drizzle/0019), then run:
//   env -u TURSO_AUTH_TOKEN TURSO_DATABASE_URL=file:/path/to/check.db \
//     pnpm dlx tsx --conditions=react-server scripts/sms-rewrite-check.ts
//
// The script refuses to run unless TURSO_DATABASE_URL is a file: URL, and refuses to run when
// Twilio credentials are present in the environment.
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
const serverOnlyStub = join(tmpdir(), 'sms-rewrite-check-server-only.js');
writeFileSync(serverOnlyStub, '');
const moduleInternals = Module as unknown as {
  _resolveFilename: (request: string, ...rest: unknown[]) => string;
  _load: (request: string, ...rest: unknown[]) => unknown;
};
const originalResolve = moduleInternals._resolveFilename;
moduleInternals._resolveFilename = function (request: string, ...rest: unknown[]) {
  return request === 'server-only' ? serverOnlyStub : originalResolve.call(this, request, ...rest);
};

// Fake the Twilio client: every text is captured, none is sent.
const fakeTwilio = { calls: [] as { to: string; body: string }[] };
const originalLoad = moduleInternals._load;
moduleInternals._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'twilio') {
    return () => ({
      messages: {
        create: async (input: { to: string; body: string }) => {
          fakeTwilio.calls.push({ to: input.to, body: input.body });
          return { sid: 'fake-sid' };
        },
      },
    });
  }
  return originalLoad.call(this, request, ...rest);
};
process.env.TWILIO_ACCOUNT_SID = 'fake';
process.env.TWILIO_AUTH_TOKEN = 'fake';
process.env.TWILIO_FROM_NUMBER = 'fake';

// next/cache needs a Next request context. Stub revalidateTag for this script only.
const nextCache = createRequire(__filename)('next/cache') as {
  revalidateTag: (...args: unknown[]) => void;
};
Object.defineProperty(nextCache, 'revalidateTag', { value: () => undefined, configurable: true });

const results: { name: string; ok: boolean; error?: string }[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const where =
      error instanceof Error
        ? (error.stack ?? '').split('\n').find((l) => l.includes('sms-rewrite-check.ts'))
        : '';
    results.push({ name, ok: false, error: message });
    console.log(`FAIL  ${name}\n      ${message.split('\n')[0]} ${where?.trim() ?? ''}`);
  }
}

const NON_GSM = /[\u2013\u2014\u2018\u2019\u201C\u201D\u2026]/;
const LINK = /https?:\/\/|www\.|\.com|\.org|\.net/i;

async function main() {
  const t = await import('../src/lib/sms-message-templates');
  const access = await import('../src/lib/kindoo-access');
  const { db } = await import('../src/lib/db');
  const schema = await import('../src/schema/schema');
  const { eq } = await import('drizzle-orm');
  const events = await import('../src/lib/events-service');
  const completeRoute = await import('../src/app/api/license-jobs/[jobId]/complete/route');
  const failRoute = await import('../src/app/api/license-jobs/[jobId]/fail/route');
  const { users, contacts, kindooLicenseJobs, notificationPreferences } = schema;

  // ── Templates ────────────────────────────────────────────────────────────────
  const ev = {
    description: 'Youth Activity Night',
    eventType: 'Ward',
    eventDate: '2026-11-07',
    startTime: '18:00',
    endTime: '21:00',
    building: 'Stake Center',
    ward: '3rd Ward',
    contactName: 'Jane Smith',
    contactPhone: '801-555-0123',
  };
  const FAIL_DETAILS = {
    'sign-in': 'Login did not reach an authenticated page before timeout.',
    slow: 'Timeout 30000ms exceeded waiting for selector',
    'user-not-found': 'Kindoo user not found',
    'time-passed': 'Expiry date already expired',
    unexpected: 'something odd',
  } as const;

  const rendered: Record<string, string> = {
    'new booking (automatic)': t.buildEventCreatedSms({ ...ev, accessPlan: 'automatic' }),
    'new booking (soon)': t.buildEventCreatedSms({ ...ev, accessPlan: 'automatic-soon' }),
    'new booking (no email)': t.buildEventCreatedSms({ ...ev, accessPlan: 'no-email' }),
    'new booking (unsupported building)': t.buildEventCreatedSms({
      ...ev,
      accessPlan: 'unsupported-building',
    }),
    'new booking (ended)': t.buildEventCreatedSms({ ...ev, accessPlan: 'ended' }),
    'new booking (default plan)': t.buildEventCreatedSms(ev),
    'set up': t.buildLicenseJobCompletedSms(ev),
    'already exists': t.buildLicenseJobFailedSms({ ...ev, details: 'Access already exists' }),
    'access request': t.buildAccessRequestSubmittedSms({
      name: 'Jane Smith',
      ward: '3rd Ward',
      email: 'jane.smith@example.com',
    }),
  };
  for (const [kind, details] of Object.entries(FAIL_DETAILS)) {
    rendered[`failed ${kind}`] = t.buildLicenseJobFailedSms({ ...ev, details });
    rendered[`failed ${kind} (after start)`] = t.buildLicenseJobFailedSms({
      ...ev,
      details,
      afterStart: true,
    });
  }

  await check(
    'every template: GSM-7 only, no links, no dashes or smart quotes, DigitalFob label, 2 segments max (request 1)',
    () => {
      for (const [name, msg] of Object.entries(rendered)) {
        assert.equal(t.sanitizeGsm(msg), msg, `${name} has non GSM-7 characters`);
        assert.equal(NON_GSM.test(msg), false, `${name} has a dash, smart quote or ellipsis`);
        assert.equal(LINK.test(msg.replace(/^Email: .*$/m, '')), false, `${name} has a link`);
        assert.equal(/\bSTOP\b/.test(msg), false, `${name} mentions STOP`);
        assert.ok(msg.startsWith('DigitalFob: '), name);
        const limit = name === 'access request' ? 1 : 2;
        assert.ok(t.smsSegments(msg) <= limit, `${name} is ${t.smsSegments(msg)} segments`);
        assert.equal(
          /[A-Z]{5,}/.test(msg.replace(/^DigitalFob:/, '').replace(/ MT\b/g, '')),
          false,
          `${name} has ALL-CAPS words`
        );
      }
    }
  );

  await check('exact wording matches the approved Page (examples)', () => {
    assert.equal(
      rendered['new booking (automatic)'],
      `DigitalFob: New booking added
Youth Activity Night (Ward event)
For: Jane Smith, 801-555-0123
Ward: 3rd Ward
Where: Stake Center
When: Sat Nov 7, 6:00-9:00 PM MT
Nothing needed from you. Door access is added in Kindoo automatically, usually about 4 hours before the start.`
    );
    assert.equal(
      rendered['set up'],
      `DigitalFob: Door access is set up
Youth Activity Night (Ward event)
For: Jane Smith, 3rd Ward
Where: Stake Center
When: Sat Nov 7, 6:00-9:00 PM MT
Nothing needed from you. Access works from about 2 hours before the start until about 2 hours after the end.`
    );
    assert.equal(
      rendered['failed sign-in'],
      `DigitalFob: Door access was not set up
Youth Activity Night (Ward event)
For: Jane Smith, 3rd Ward
Where: Stake Center
When: Sat Nov 7, 6:00-9:00 PM MT
Why: Kindoo sign-in timed out.
Please do one of these before the event starts: tap Retry on this event in DigitalFob, or add access in Kindoo.`
    );
    assert.equal(
      rendered['already exists'],
      `DigitalFob: Door access already exists
Youth Activity Night (Ward event)
For: Jane Smith, 3rd Ward
Where: Stake Center
When: Sat Nov 7, 6:00-9:00 PM MT
Kindoo already shows access for this person, so nothing was added.
Nothing needed from you. You can confirm in Kindoo if you like.`
    );
    assert.equal(
      rendered['access request'],
      `DigitalFob: New access request
From: Jane Smith
Ward: 3rd Ward
Email: jane.smith@example.com
Please approve or deny it in DigitalFob when you can. No rush.`
    );
    assert.match(rendered['failed slow'], /Why: Kindoo was slow to respond\./);
    assert.match(
      rendered['failed user-not-found'],
      /Why: this email was not found in Kindoo\.\nPlease fix the email on the booking in DigitalFob before the event starts, then tap Retry\.$/
    );
    assert.match(
      rendered['failed time-passed'],
      /Why: Kindoo saw this time as already past\.\nPlease check the date and time on the booking in DigitalFob, then tap Retry\.$/
    );
    assert.match(rendered['failed unexpected'], /Why: something unexpected happened\./);
  });

  await check('already exists is not a failure: own headline, no Why line, nothing needed', () => {
    const msg = rendered['already exists'];
    assert.equal(/not set up|FAILED|Why:/i.test(msg), false);
    assert.match(msg, /Nothing needed from you\./);
  });

  await check(
    'after the event starts, failure texts say "as soon as you can" instead of "before the event starts"',
    () => {
      for (const kind of ['sign-in', 'slow', 'unexpected', 'user-not-found'] as const) {
        assert.equal(rendered[`failed ${kind}`].includes('before the event starts'), true, kind);
        const late = rendered[`failed ${kind} (after start)`];
        assert.equal(late.includes('before the event starts'), false, kind);
        assert.match(late, /as soon as you can/, kind);
      }
      // "check the date and time" has no deadline either way
      assert.equal(rendered['failed time-passed (after start)'], rendered['failed time-passed']);
    }
  );

  await check('new booking action line is accurate for events with no job', () => {
    assert.match(
      rendered['new booking (automatic)'],
      /automatically, usually about 4 hours before the start\.$/
    );
    for (const plan of ['no-email', 'unsupported-building', 'ended']) {
      const msg =
        rendered[
          `new booking (${plan === 'no-email' ? 'no email' : plan === 'unsupported-building' ? 'unsupported building' : 'ended'})`
        ];
      assert.equal(/Nothing needed from you|4 hours|automatically, usually/.test(msg), false, plan);
      assert.match(msg, /not added automatically|will not be added automatically/, plan);
    }
    assert.match(
      rendered['new booking (no email)'],
      /add one in DigitalFob, or add access in Kindoo/
    );
    assert.match(rendered['new booking (soon)'], /usually soon since the event is close/);
  });

  await check('long values never cut off the action line, and stay within limits', () => {
    const long = {
      description: 'Stake Youth Conference planning committee dinner and activity night',
      eventType: 'Stake',
      eventDate: '2026-11-07',
      startTime: '11:00',
      endTime: '13:30',
      building: 'Maples Building',
      ward: 'Other: Riverton Southridge 12th Ward',
      contactName: 'Alexandria Montgomery-Featherstonehaugh',
      contactPhone: '801-555-0123',
    };
    const longRendered = [
      t.buildEventCreatedSms({ ...long, accessPlan: 'automatic' }),
      t.buildEventCreatedSms({ ...long, accessPlan: 'no-email' }),
      t.buildLicenseJobCompletedSms(long),
      t.buildLicenseJobFailedSms({ ...long, details: 'weird' }),
      t.buildLicenseJobFailedSms({ ...long, details: 'weird', afterStart: true }),
      t.buildLicenseJobFailedSms({ ...long, details: 'Access already exists' }),
    ];
    for (const msg of longRendered) {
      assert.ok(t.smsSegments(msg) <= 2);
      assert.equal(msg.endsWith('...'), false, `cut off: ${msg}`);
    }
    const req = t.buildAccessRequestSubmittedSms({
      name: 'Alexandria Montgomery-Featherstonehaugh',
      ward: 'Sycamores 8th Ward',
      email: 'alexandria.montgomery-featherstonehaugh@verylongdomainname.example.com',
    });
    assert.equal(t.smsSegments(req), 1);
    assert.match(req, /^DigitalFob: New access request\nFrom: Alexandria/);
  });

  await check('classifyFailure sorts raw worker text into the six kinds', () => {
    assert.equal(t.classifyFailure('Expiry date already expired'), 'time-passed');
    assert.equal(t.classifyFailure('Active license already exists'), 'already-exists');
    assert.equal(t.classifyFailure('existing-active-license'), 'already-exists');
    assert.equal(t.classifyFailure('User not found'), 'user-not-found');
    assert.equal(t.classifyFailure('Password rejected'), 'sign-in');
    assert.equal(t.classifyFailure('selector not visible'), 'slow');
    assert.equal(t.classifyFailure(null), 'unexpected');
    assert.equal(t.friendlyFailureReason('Login timed out'), 'Kindoo sign-in timed out.');
  });

  await check(
    'access plan: automatic, soon, no email, unsupported building, ended (Mountain time)',
    () => {
      const base = {
        building: 'Stake Center',
        contactEmail: 'a@example.com',
        eventDate: '2026-11-07',
        startTime: '18:00',
        endTime: '21:00',
      };
      const at = (iso: string) => new Date(iso); // Nov 7 2026 is MST (UTC-7)
      assert.equal(access.getKindooAccessPlan(base, at('2026-11-07T20:30:00Z')), 'automatic'); // 1:30 PM
      assert.equal(access.getKindooAccessPlan(base, at('2026-11-07T21:00:00Z')), 'automatic-soon'); // 2:00 PM, 4h before
      assert.equal(access.getKindooAccessPlan(base, at('2026-11-08T03:00:00Z')), 'automatic-soon'); // 8:00 PM, during
      assert.equal(access.getKindooAccessPlan(base, at('2026-11-08T04:30:00Z')), 'ended'); // 9:30 PM
      assert.equal(
        access.getKindooAccessPlan({ ...base, contactEmail: '  ' }, at('2026-10-01T00:00:00Z')),
        'no-email'
      );
      assert.equal(
        access.getKindooAccessPlan(
          { ...base, contactEmail: undefined },
          at('2026-10-01T00:00:00Z')
        ),
        'no-email'
      );
      assert.equal(
        access.getKindooAccessPlan({ ...base, building: 'Chapel' }, at('2026-10-01T00:00:00Z')),
        'unsupported-building'
      );
      // early start: window opens at 5:00 AM, so the job is due at 3:00 AM
      const early = { ...base, startTime: '06:00', endTime: '08:00' };
      assert.equal(access.getKindooAccessPlan(early, at('2026-11-07T09:50:00Z')), 'automatic'); // 2:50 AM
      assert.equal(access.getKindooAccessPlan(early, at('2026-11-07T10:00:00Z')), 'automatic-soon'); // 3:00 AM
      assert.equal(
        access.hasEventStarted('2026-11-07', '18:00', at('2026-11-08T00:59:00Z')),
        false
      ); // 5:59 PM
      assert.equal(access.hasEventStarted('2026-11-07', '18:00', at('2026-11-08T01:00:00Z')), true); // 6:00 PM
    }
  );

  // ── Fixtures for the send paths ──────────────────────────────────────────────
  const tag = `smr${Date.now().toString(36)}`;
  const id = (name: string) => `${tag}-${name}`;
  let phoneSeq = 0;
  const mkUser = async (
    name: string,
    role: 'admin' | 'stake_manager' | 'ward_manager' | 'ward_user',
    ward: '1st Ward' | '3rd Ward',
    opts: {
      email?: string;
      sms?: boolean | 'off';
      completed?: boolean;
      failed?: boolean;
      created?: boolean;
    } = {}
  ) => {
    const userId = id(name);
    await db
      .insert(users)
      .values({
        id: userId,
        name: `${name} Person`,
        email: opts.email ?? `${userId}@example.test`,
        role,
        ward,
        phone: '5555550100',
      });
    const phone = `55555502${String(10 + phoneSeq++).padStart(2, '0')}`;
    if (opts.sms !== undefined) {
      await db.insert(notificationPreferences).values({
        userId,
        smsEnabled: opts.sms !== 'off',
        smsPhone: phone,
        licenseJobCompletedSms: opts.completed ?? true,
        licenseJobFailedSms: opts.failed ?? true,
        eventCreatedSms: opts.created ?? false,
      });
    }
    return { userId, role, ward, phone: `+1${phone}` };
  };
  // Existing database users with SMS enabled would add noise: make sure none can be texted.
  await db.update(notificationPreferences).set({ smsEnabled: false });

  const adminA = await mkUser('adminA', 'admin', '1st Ward', { sms: true, created: true });
  const adminB = await mkUser('adminB', 'admin', '1st Ward', {
    sms: true,
    completed: false,
    created: true,
  });
  await mkUser('adminC', 'admin', '1st Ward', { sms: 'off', created: true });
  const stake = await mkUser('stake', 'stake_manager', '1st Ward', { sms: true, created: true });
  const wardMgr = await mkUser('wardmgr', 'ward_manager', '1st Ward', { sms: true, created: true });
  const otherWardMgr = await mkUser('otherwardmgr', 'ward_manager', '3rd Ward', {
    sms: true,
    created: true,
  });
  const creator = await mkUser('creator', 'ward_user', '1st Ward', { sms: true, created: true });
  // The synthetic creator may already exist in the dev database copy. Reuse it if so.
  const existingSynthetic = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'facilities-api@kindoo.internal'))
  )[0];
  const synthetic = existingSynthetic
    ? {
        userId: existingSynthetic.id,
        role: 'admin' as const,
        ward: '1st Ward' as const,
        phone: '+10000000000',
      }
    : await mkUser('facilities', 'admin', '1st Ward', { email: 'facilities-api@kindoo.internal' });
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, synthetic.userId));

  const contactId = id('contact');
  await db
    .insert(contacts)
    .values({
      id: contactId,
      name: 'Check Contact',
      ward: '1st Ward',
      email: `${contactId}@example.test`,
      phone: '5555550199',
    });

  const ymdPlusDays = (days: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Denver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + days * 86_400_000));
  const tomorrow = ymdPlusDays(1);
  const today = ymdPlusDays(0);
  const mkEventFor = async (
    name: string,
    ownerId: string,
    date: string,
    start = '18:00',
    end = '20:00'
  ) => {
    const eventId = id(name);
    await db
      .insert(schema.events)
      .values({
        id: eventId,
        building: 'Stake Center',
        eventDate: date,
        startTime: start,
        endTime: end,
        contactId,
        description: `check ${name}`,
        eventType: 'Ward',
        userId: ownerId,
      });
    return eventId;
  };
  const mkProcessingJob = async (name: string, eventId: string, ownerId: string) => {
    const jobId = id(name);
    await db.insert(kindooLicenseJobs).values({
      id: jobId,
      eventId,
      requestedByUserId: ownerId,
      status: 'processing',
      email: 'check@example.test',
      description: 'check',
      timezone: 'America/Denver',
      startDate: tomorrow,
      startTime: '16:00',
      endDate: tomorrow,
      endTime: '22:00',
      kindooAccessRule: 'STAKE CENTER - LIMITED',
      claimedAt: new Date(),
      workerId: 'check-worker',
      attempts: 1,
    });
    return jobId;
  };
  const workerPost = (path: string, body: unknown) =>
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'x-worker-token': 'check-worker-token',
        'x-worker-id': 'check-worker',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  const complete = async (jobId: string) => {
    const res = await completeRoute.POST(
      workerPost(`/api/license-jobs/${jobId}/complete`, {
        completionType: 'temporary-license-created',
      }),
      { params: Promise.resolve({ jobId }) }
    );
    assert.equal(res.status, 200);
  };
  const fail = async (jobId: string, details: string) => {
    const res = await failRoute.POST(workerPost(`/api/license-jobs/${jobId}/fail`, { details }), {
      params: Promise.resolve({ jobId }),
    });
    assert.equal(res.status, 200);
  };
  const sentTo = () => fakeTwilio.calls.map((c) => c.to).sort();

  await check(
    'normal booking: ready and failed texts go to the creator only (unchanged)',
    async () => {
      fakeTwilio.calls.length = 0;
      const e1 = await mkEventFor('norm-ready', creator.userId, tomorrow);
      await complete(await mkProcessingJob('norm-ready-j', e1, creator.userId));
      assert.deepEqual(sentTo(), [creator.phone]);
      assert.match(fakeTwilio.calls[0].body, /^DigitalFob: Door access is set up/);
      fakeTwilio.calls.length = 0;
      const e2 = await mkEventFor('norm-fail', creator.userId, tomorrow);
      await fail(await mkProcessingJob('norm-fail-j', e2, creator.userId), 'Timeout waiting');
      assert.deepEqual(sentTo(), [creator.phone]);
      assert.match(fakeTwilio.calls[0].body, /^DigitalFob: Door access was not set up/);
    }
  );

  await check(
    'normal booking made by an admin: only that admin is texted, not the other admins',
    async () => {
      fakeTwilio.calls.length = 0;
      const e = await mkEventFor('admin-own', adminA.userId, tomorrow);
      await complete(await mkProcessingJob('admin-own-j', e, adminA.userId));
      assert.deepEqual(sentTo(), [adminA.phone]);
    }
  );

  await check(
    'Facilities Lead booking: ready text goes to admins opted in for it, once each, never the synthetic creator',
    async () => {
      fakeTwilio.calls.length = 0;
      const e = await mkEventFor('fac-ready', synthetic.userId, tomorrow);
      await complete(await mkProcessingJob('fac-ready-j', e, synthetic.userId));
      // adminA opted in; adminB opted out of "ready"; adminC has SMS off; stake and managers are not admins.
      assert.deepEqual(sentTo(), [adminA.phone]);
      assert.ok(!fakeTwilio.calls.some((c) => c.to === synthetic.phone));
      assert.match(fakeTwilio.calls[0].body, /^DigitalFob: Door access is set up/);
    }
  );

  await check(
    'Facilities Lead booking: failed text goes to admins opted in for failures (per message type)',
    async () => {
      fakeTwilio.calls.length = 0;
      const e = await mkEventFor('fac-fail', synthetic.userId, tomorrow);
      await fail(await mkProcessingJob('fac-fail-j', e, synthetic.userId), 'Timeout waiting');
      assert.deepEqual(sentTo(), [adminA.phone, adminB.phone].sort());
      assert.equal(fakeTwilio.calls.length, 2, 'at most one text per person');
      assert.ok(
        !fakeTwilio.calls.some(
          (c) => c.to === synthetic.phone || c.to === stake.phone || c.to === wardMgr.phone
        )
      );
    }
  );

  await check(
    'failed text switches to "as soon as you can" once the event has started',
    async () => {
      fakeTwilio.calls.length = 0;
      const future = await mkEventFor('late-future', creator.userId, tomorrow);
      await fail(await mkProcessingJob('late-future-j', future, creator.userId), 'weird');
      assert.match(fakeTwilio.calls[0].body, /before the event starts/);
      fakeTwilio.calls.length = 0;
      const started = await mkEventFor(
        'late-started',
        creator.userId,
        ymdPlusDays(-1),
        '06:00',
        '08:00'
      );
      await fail(await mkProcessingJob('late-started-j', started, creator.userId), 'weird');
      assert.match(fakeTwilio.calls[0].body, /as soon as you can/);
      assert.equal(fakeTwilio.calls[0].body.includes('before the event starts'), false);
      void today;
    }
  );

  await check(
    'new booking text (Ward: Other fix): shows the typed unit name, same recipients as before',
    async () => {
      fakeTwilio.calls.length = 0;
      const r = await events.createEventForAccess(
        { userId: creator.userId, role: 'admin', ward: '1st Ward' },
        {
          building: 'Stake Center',
          ward: 'Other',
          otherWardName: 'Riverton 3rd Ward',
          eventType: 'Ward',
          name: 'Pat Jones',
          eventDate: tomorrow,
          startTime: '18:00',
          endTime: '20:00',
          phone: '801-555-0123',
          email: 'pat@example.test',
          description: 'Other ward dinner',
        }
      );
      assert.equal(r.success, true, JSON.stringify(r));
      // Recipients: all admins, stake managers, and managers of the event's ward (Other has no managers), minus the creator.
      assert.deepEqual(sentTo(), [adminA.phone, adminB.phone, stake.phone].sort());
      const body = fakeTwilio.calls[0].body;
      assert.match(body, /\nWard: Other: Riverton 3rd Ward\n/);
      assert.match(body, /^DigitalFob: New booking added/);
      assert.match(body, /automatically, usually about 4 hours before the start\.$/);
    }
  );

  await check(
    'new booking for a listed ward: recipients unchanged (admins, stake, that ward managers, minus creator)',
    async () => {
      fakeTwilio.calls.length = 0;
      const r = await events.createEventForAccess(
        { userId: creator.userId, role: 'admin', ward: '1st Ward' },
        {
          building: 'Stake Center',
          ward: '1st Ward',
          eventType: 'Ward',
          name: 'Pat Jones',
          eventDate: tomorrow,
          startTime: '18:00',
          endTime: '20:00',
          phone: '801-555-0123',
          email: 'pat@example.test',
          description: 'Ward dinner',
        }
      );
      assert.equal(r.success, true, JSON.stringify(r));
      assert.deepEqual(sentTo(), [adminA.phone, adminB.phone, stake.phone, wardMgr.phone].sort());
      assert.ok(
        !fakeTwilio.calls.some((c) => c.to === otherWardMgr.phone),
        'other ward manager is not texted'
      );
      assert.match(fakeTwilio.calls[0].body, /\nWard: 1st Ward\n/);
    }
  );

  await check('new booking with no contact email does not promise automation', async () => {
    fakeTwilio.calls.length = 0;
    const r = await events.createEventForAccess(
      { userId: creator.userId, role: 'admin', ward: '1st Ward' },
      {
        building: 'Stake Center',
        ward: '1st Ward',
        eventType: 'Ward',
        name: 'Pat Jones',
        eventDate: tomorrow,
        startTime: '18:00',
        endTime: '20:00',
        phone: '801-555-0123',
        description: 'Phone only booking',
      }
    );
    assert.equal(r.success, true, JSON.stringify(r));
    const body = fakeTwilio.calls[0].body;
    assert.match(body, /will not be added automatically \(no contact email\)/);
    assert.equal(/Nothing needed|4 hours/.test(body), false);
  });

  await check('the recipient helper only widens for the synthetic creator', async () => {
    const rec = await import('../src/lib/license-job-recipients');
    assert.deepEqual(await rec.resolveLicenseJobSmsRecipientIds(creator.userId), [creator.userId]);
    assert.deepEqual(await rec.resolveLicenseJobSmsRecipientIds('missing-user'), ['missing-user']);
    const ids = await rec.resolveLicenseJobSmsRecipientIds(synthetic.userId);
    assert.ok(ids.includes(adminA.userId) && ids.includes(adminB.userId));
    assert.ok(!ids.includes(synthetic.userId) && !ids.includes(stake.userId));
    assert.equal(new Set(ids).size, ids.length);
    const rows = await db.select({ role: users.role }).from(users).where(eq(users.id, ids[0]));
    assert.equal(rows[0].role, 'admin');
  });

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
