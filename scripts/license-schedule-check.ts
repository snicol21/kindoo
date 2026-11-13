// Pure check for early-morning job pull-forward. No database, no Twilio, no network.
//
// Run:
//   pnpm dlx tsx scripts/license-schedule-check.ts
import assert from 'node:assert/strict';

import { getKindooAccessPlan, hasEventStarted } from '../src/lib/kindoo-access';
import {
  DEFAULT_SCHEDULE_CONFIG,
  eventEndsInFuture,
  getJobDueAt,
  getJobDueTimestamp,
  getLicenseWindow,
  getScheduleConfig,
  isDueForQueue,
  previousCivilDate,
  SCHEDULE_TIMEZONE,
  shouldPullForward,
  zonedCivilToUtcMs,
  type LicenseScheduleConfig,
} from '../src/lib/license-schedule';

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
        ? (error.stack ?? '').split('\n').find((l) => l.includes('license-schedule-check.ts'))
        : '';
    results.push({ name, ok: false, error: message });
    console.log(`FAIL  ${name}\n      ${message.split('\n')[0]} ${where?.trim() ?? ''}`);
  }
}

const defaults: LicenseScheduleConfig = DEFAULT_SCHEDULE_CONFIG;
const eventDate = '2026-11-08';
const previousEvening = '2026-11-07';

function denver(isoUtc: string) {
  return new Date(isoUtc);
}

async function main() {
  // ── Due-time table: 5 AM through noon ────────────────────────────────────────

  await check('due-time table for 5 AM through noon (11 AM pulls, noon does not)', () => {
    const table: Array<{
      start: string;
      windowStart: string;
      expectedDue: { ymd: string; hm: string };
    }> = [
      { start: '05:00', windowStart: '05:00', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      { start: '06:00', windowStart: '05:00', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      { start: '07:00', windowStart: '05:00', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      { start: '08:00', windowStart: '06:00', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      { start: '09:00', windowStart: '07:00', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      { start: '10:00', windowStart: '08:00', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      { start: '10:45', windowStart: '08:45', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      // 11 AM is normally due at 07:00, which is before MORNING_END 08:00, so it pulls.
      { start: '11:00', windowStart: '09:00', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      { start: '11:45', windowStart: '09:45', expectedDue: { ymd: previousEvening, hm: '21:00' } },
      // Noon is normally due at 08:00, which is not before 08:00, so it stays.
      { start: '12:00', windowStart: '10:00', expectedDue: { ymd: eventDate, hm: '08:00' } },
    ];

    for (const row of table) {
      const end = '23:00';
      const window = getLicenseWindow(eventDate, row.start, end);
      assert.equal(window?.startTime, row.windowStart, `${row.start} window start`);
      assert.deepEqual(
        getJobDueAt(eventDate, row.start, defaults),
        row.expectedDue,
        `${row.start} due`
      );
    }
  });

  await check('afternoon events keep a same-day due four hours before start', () => {
    assert.deepEqual(getJobDueAt(eventDate, '13:00', defaults), { ymd: eventDate, hm: '09:00' });
    assert.deepEqual(getJobDueAt(eventDate, '18:00', defaults), { ymd: eventDate, hm: '14:00' });
    // Latest allowed start 23:00: window 21:00, due 19:00, not in the quiet window.
    assert.deepEqual(getJobDueAt(eventDate, '23:00', defaults), { ymd: eventDate, hm: '19:00' });
  });

  await check('access rule windows are unchanged by pull-forward', () => {
    const early = getLicenseWindow(eventDate, '07:00', '09:00');
    assert.deepEqual(early, {
      startDate: eventDate,
      startTime: '05:00',
      endDate: eventDate,
      endTime: '11:00',
    });
    const mid = getLicenseWindow(eventDate, '11:00', '13:00');
    assert.deepEqual(mid, {
      startDate: eventDate,
      startTime: '09:00',
      endDate: eventDate,
      endTime: '15:00',
    });
    const noon = getLicenseWindow(eventDate, '12:00', '14:00');
    assert.deepEqual(noon, {
      startDate: eventDate,
      startTime: '10:00',
      endDate: eventDate,
      endTime: '16:00',
    });
    const late = getLicenseWindow(eventDate, '21:00', '23:00');
    assert.deepEqual(late, {
      startDate: eventDate,
      startTime: '19:00',
      endDate: eventDate,
      endTime: '23:00',
    });
  });

  // ── Quiet-window boundaries ──────────────────────────────────────────────────

  await check('quiet window is NIGHT_CUTOFF inclusive and MORNING_END exclusive', () => {
    assert.equal(shouldPullForward('21:00', defaults), true);
    assert.equal(shouldPullForward('20:59', defaults), false);
    assert.equal(shouldPullForward('07:59', defaults), true);
    assert.equal(shouldPullForward('08:00', defaults), false);
    assert.equal(shouldPullForward('00:00', defaults), true);
    assert.equal(shouldPullForward('03:00', defaults), true);
  });

  // ── Catch-up after 9 PM ──────────────────────────────────────────────────────

  await check('catch-up: next-morning event created after 9 PM is due immediately', () => {
    // 8:59 PM MST Nov 7
    assert.equal(
      isDueForQueue(eventDate, '07:00', '09:00', denver('2026-11-08T03:59:00Z'), defaults),
      false
    );
    // 9:00 PM MST Nov 7, on the pulled due
    assert.equal(
      isDueForQueue(eventDate, '07:00', '09:00', denver('2026-11-08T04:00:00Z'), defaults),
      true
    );
    // 10:00 PM MST Nov 7, booking created after 9 PM
    assert.equal(
      isDueForQueue(eventDate, '07:00', '09:00', denver('2026-11-08T05:00:00Z'), defaults),
      true
    );
    // 2:50 AM MST Nov 8, still before the event
    assert.equal(
      isDueForQueue(eventDate, '07:00', '09:00', denver('2026-11-08T09:50:00Z'), defaults),
      true
    );
    // Event end 9:00 AM is inclusive
    assert.equal(
      isDueForQueue(eventDate, '07:00', '09:00', denver('2026-11-08T16:00:00Z'), defaults),
      true
    );
    // 9:01 AM, after the event end, is no longer due
    assert.equal(
      isDueForQueue(eventDate, '07:00', '09:00', denver('2026-11-08T16:01:00Z'), defaults),
      false
    );
  });

  await check('noon events are not due the evening before', () => {
    assert.equal(
      isDueForQueue(eventDate, '12:00', '14:00', denver('2026-11-08T04:00:00Z'), defaults),
      false
    );
    // 8:00 AM MST Nov 8, the unpulled due
    assert.equal(
      isDueForQueue(eventDate, '12:00', '14:00', denver('2026-11-08T15:00:00Z'), defaults),
      true
    );
    // 7:59 AM MST Nov 8, still before the unpulled due
    assert.equal(
      isDueForQueue(eventDate, '12:00', '14:00', denver('2026-11-08T14:59:00Z'), defaults),
      false
    );
  });

  // ── DST nights ───────────────────────────────────────────────────────────────

  await check('DST spring-forward night 2026-03-08: previous civil evening, not minus 24h', () => {
    // DST starts at 2:00 AM on Sunday March 8, 2026. Saturday March 7 is still MST (UTC-7).
    const due = getJobDueAt('2026-03-08', '07:00', defaults);
    assert.deepEqual(due, { ymd: '2026-03-07', hm: '21:00' });
    assert.equal(previousCivilDate('2026-03-08'), '2026-03-07');
    assert.equal(zonedCivilToUtcMs('2026-03-07', '21:00'), Date.parse('2026-03-08T04:00:00.000Z'));
    assert.equal(
      getJobDueTimestamp('2026-03-08', '07:00', defaults),
      Date.parse('2026-03-08T04:00:00.000Z')
    );
    // 9:00 PM MST March 7
    assert.equal(
      isDueForQueue('2026-03-08', '07:00', '09:00', denver('2026-03-08T04:00:00Z'), defaults),
      true
    );
    assert.equal(
      isDueForQueue('2026-03-08', '07:00', '09:00', denver('2026-03-08T03:59:00Z'), defaults),
      false
    );

    // Event on Monday March 9: pull to Sunday March 8 at 21:00, which is MDT (UTC-6).
    assert.deepEqual(getJobDueAt('2026-03-09', '07:00', defaults), {
      ymd: '2026-03-08',
      hm: '21:00',
    });
    assert.equal(zonedCivilToUtcMs('2026-03-08', '21:00'), Date.parse('2026-03-09T03:00:00.000Z'));
  });

  await check('DST fall-back night 2026-11-01: previous civil evening uses MDT', () => {
    // DST ends at 2:00 AM on Sunday November 1, 2026. Saturday October 31 is MDT (UTC-6).
    const due = getJobDueAt('2026-11-01', '07:00', defaults);
    assert.deepEqual(due, { ymd: '2026-10-31', hm: '21:00' });
    assert.equal(previousCivilDate('2026-11-01'), '2026-10-31');
    assert.equal(zonedCivilToUtcMs('2026-10-31', '21:00'), Date.parse('2026-11-01T03:00:00.000Z'));
    assert.equal(
      getJobDueTimestamp('2026-11-01', '07:00', defaults),
      Date.parse('2026-11-01T03:00:00.000Z')
    );
    assert.equal(
      isDueForQueue('2026-11-01', '07:00', '09:00', denver('2026-11-01T03:00:00Z'), defaults),
      true
    );
    assert.equal(
      isDueForQueue('2026-11-01', '07:00', '09:00', denver('2026-11-01T02:59:00Z'), defaults),
      false
    );
  });

  // ── Month and year wrap ──────────────────────────────────────────────────────

  await check('previous civil date wraps months, years, and leap days', () => {
    assert.equal(previousCivilDate('2026-01-01'), '2025-12-31');
    assert.equal(previousCivilDate('2026-03-01'), '2026-02-28'); // 2026 is not a leap year
    assert.equal(previousCivilDate('2028-03-01'), '2028-02-29');
    assert.deepEqual(getJobDueAt('2026-01-01', '07:00', defaults), {
      ymd: '2025-12-31',
      hm: '21:00',
    });
    assert.deepEqual(getJobDueAt('2026-03-01', '07:00', defaults), {
      ymd: '2026-02-28',
      hm: '21:00',
    });
    assert.deepEqual(getJobDueAt('2028-03-01', '07:00', defaults), {
      ymd: '2028-02-29',
      hm: '21:00',
    });
  });

  // ── getKindooAccessPlan ──────────────────────────────────────────────────────

  await check('getKindooAccessPlan follows the pulled due for early events', () => {
    const early = {
      building: 'Stake Center',
      contactEmail: 'a@example.com',
      eventDate: '2026-11-08',
      startTime: '07:00',
      endTime: '09:00',
    };
    const afternoon = { ...early, startTime: '18:00', endTime: '21:00' };
    const noon = { ...early, startTime: '12:00', endTime: '14:00' };

    // 8:59 PM MST Nov 7
    assert.equal(getKindooAccessPlan(early, denver('2026-11-08T03:59:00Z')), 'automatic');
    // 9:00 PM MST Nov 7
    assert.equal(getKindooAccessPlan(early, denver('2026-11-08T04:00:00Z')), 'automatic-soon');
    // 11 AM event is also pulled, so it is soon at 9 PM as well
    assert.equal(
      getKindooAccessPlan(
        { ...early, startTime: '11:00', endTime: '13:00' },
        denver('2026-11-08T04:00:00Z')
      ),
      'automatic-soon'
    );
    // Noon is not pulled: still automatic at 9 PM the evening before, soon at 8 AM
    assert.equal(getKindooAccessPlan(noon, denver('2026-11-08T04:00:00Z')), 'automatic');
    assert.equal(getKindooAccessPlan(noon, denver('2026-11-08T15:00:00Z')), 'automatic-soon');

    // Afternoon event: due at 2:00 PM MST Nov 8 = 21:00Z
    assert.equal(getKindooAccessPlan(afternoon, denver('2026-11-08T20:59:00Z')), 'automatic');
    assert.equal(getKindooAccessPlan(afternoon, denver('2026-11-08T21:00:00Z')), 'automatic-soon');
    assert.equal(getKindooAccessPlan(afternoon, denver('2026-11-09T04:30:00Z')), 'ended'); // 9:30 PM

    assert.equal(getKindooAccessPlan({ ...early, contactEmail: '  ' }), 'no-email');
    assert.equal(getKindooAccessPlan({ ...early, building: 'Chapel' }), 'unsupported-building');

    assert.equal(hasEventStarted('2026-11-08', '07:00', denver('2026-11-08T13:59:00Z')), false);
    assert.equal(hasEventStarted('2026-11-08', '07:00', denver('2026-11-08T14:00:00Z')), true);
    assert.equal(
      eventEndsInFuture('2026-11-08', '09:00', SCHEDULE_TIMEZONE, denver('2026-11-08T16:00:00Z')),
      true
    );
    assert.equal(
      eventEndsInFuture('2026-11-08', '09:00', SCHEDULE_TIMEZONE, denver('2026-11-08T16:01:00Z')),
      false
    );
  });

  // ── Config and invalid env ───────────────────────────────────────────────────

  await check(
    'invalid env values and a pull-forward after the cutoff fall back to defaults',
    () => {
      const saved = {
        night: process.env.KINDOO_SCHEDULE_NIGHT_CUTOFF,
        morning: process.env.KINDOO_SCHEDULE_MORNING_END,
        pull: process.env.KINDOO_SCHEDULE_PULL_FORWARD_AT,
        pubNight: process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_NIGHT_CUTOFF,
        pubMorning: process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_MORNING_END,
        pubPull: process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_PULL_FORWARD_AT,
      };
      const restore = () => {
        const apply = (key: string, value: string | undefined) => {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        };
        apply('KINDOO_SCHEDULE_NIGHT_CUTOFF', saved.night);
        apply('KINDOO_SCHEDULE_MORNING_END', saved.morning);
        apply('KINDOO_SCHEDULE_PULL_FORWARD_AT', saved.pull);
        apply('NEXT_PUBLIC_KINDOO_SCHEDULE_NIGHT_CUTOFF', saved.pubNight);
        apply('NEXT_PUBLIC_KINDOO_SCHEDULE_MORNING_END', saved.pubMorning);
        apply('NEXT_PUBLIC_KINDOO_SCHEDULE_PULL_FORWARD_AT', saved.pubPull);
      };

      try {
        delete process.env.KINDOO_SCHEDULE_NIGHT_CUTOFF;
        delete process.env.KINDOO_SCHEDULE_MORNING_END;
        delete process.env.KINDOO_SCHEDULE_PULL_FORWARD_AT;
        delete process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_NIGHT_CUTOFF;
        delete process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_MORNING_END;
        delete process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_PULL_FORWARD_AT;
        assert.deepEqual(getScheduleConfig(), DEFAULT_SCHEDULE_CONFIG);

        process.env.KINDOO_SCHEDULE_NIGHT_CUTOFF = '25:00';
        process.env.KINDOO_SCHEDULE_MORNING_END = 'abc';
        process.env.KINDOO_SCHEDULE_PULL_FORWARD_AT = '9:00'; // not zero-padded HH:mm
        assert.deepEqual(getScheduleConfig(), DEFAULT_SCHEDULE_CONFIG);

        process.env.KINDOO_SCHEDULE_NIGHT_CUTOFF = '21:00';
        process.env.KINDOO_SCHEDULE_MORNING_END = '08:00';
        process.env.KINDOO_SCHEDULE_PULL_FORWARD_AT = '22:00'; // after the cutoff
        assert.equal(getScheduleConfig().pullForwardAt, '21:00');

        delete process.env.KINDOO_SCHEDULE_NIGHT_CUTOFF;
        delete process.env.KINDOO_SCHEDULE_MORNING_END;
        delete process.env.KINDOO_SCHEDULE_PULL_FORWARD_AT;
        process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_NIGHT_CUTOFF = '22:00';
        process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_MORNING_END = '09:00';
        process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_PULL_FORWARD_AT = '20:00';
        assert.deepEqual(getScheduleConfig(), {
          nightCutoff: '22:00',
          morningEnd: '09:00',
          pullForwardAt: '20:00',
        });

        // Server-side names win over the public mirrors.
        process.env.KINDOO_SCHEDULE_NIGHT_CUTOFF = '21:30';
        process.env.KINDOO_SCHEDULE_MORNING_END = '07:30';
        process.env.KINDOO_SCHEDULE_PULL_FORWARD_AT = '21:00';
        assert.deepEqual(getScheduleConfig(), {
          nightCutoff: '21:30',
          morningEnd: '07:30',
          pullForwardAt: '21:00',
        });
      } finally {
        restore();
      }
    }
  );

  await check('invalid event fields return null or not due', () => {
    assert.equal(getJobDueAt('11-08-2026', '07:00', defaults), null);
    assert.equal(getJobDueAt(eventDate, '25:00', defaults), null);
    assert.equal(
      isDueForQueue(eventDate, '07:00', '9:00', denver('2026-11-08T05:00:00Z'), defaults),
      false
    );
    assert.equal(getJobDueTimestamp('bad', '07:00', defaults), Number.NaN);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total`
  );
  if (failed.length > 0) {
    for (const row of failed) {
      console.log(`  - ${row.name}: ${row.error}`);
    }
    process.exitCode = 1;
  }
}

void main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
