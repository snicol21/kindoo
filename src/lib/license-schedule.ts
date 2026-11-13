// Scheduling rules for Kindoo license jobs, shared by schedule-due, the manual override
// (which previews what reopening an event would let the worker do), access-plan SMS, and
// the dashboard countdown. This module is safe to import from client components.

export const SCHEDULE_TIMEZONE = 'America/Denver';
const EARLIEST_MINUTES = 5 * 60;
const LATEST_MINUTES = 23 * 60;

export type LicenseScheduleConfig = {
  nightCutoff: string;
  morningEnd: string;
  pullForwardAt: string;
};

export const DEFAULT_SCHEDULE_CONFIG: LicenseScheduleConfig = {
  nightCutoff: '21:00',
  morningEnd: '08:00',
  pullForwardAt: '21:00',
};

const HM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidHm(value: string): boolean {
  return HM_PATTERN.test(value);
}

function firstValidHm(...candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && isValidHm(trimmed)) return trimmed;
  }
  return null;
}

/**
 * Read the quiet-window knobs. Server-side `KINDOO_SCHEDULE_*` wins when set and valid.
 * Client bundles only see the `NEXT_PUBLIC_KINDOO_SCHEDULE_*` mirrors (Next inlines those
 * at build time), so both should be set to the same values if the defaults are changed.
 * Invalid HH:mm values, and a pull-forward time after the night cutoff, fall back to the defaults.
 *
 * The NEXT_PUBLIC_ reads must stay as static `process.env.NEXT_PUBLIC_...` member access
 * so Next.js can inline them into the client bundle.
 */
export function getScheduleConfig(): LicenseScheduleConfig {
  const nightCutoff =
    firstValidHm(
      process.env.KINDOO_SCHEDULE_NIGHT_CUTOFF,
      process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_NIGHT_CUTOFF
    ) ?? DEFAULT_SCHEDULE_CONFIG.nightCutoff;

  const morningEnd =
    firstValidHm(
      process.env.KINDOO_SCHEDULE_MORNING_END,
      process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_MORNING_END
    ) ?? DEFAULT_SCHEDULE_CONFIG.morningEnd;

  const pullForwardAt =
    firstValidHm(
      process.env.KINDOO_SCHEDULE_PULL_FORWARD_AT,
      process.env.NEXT_PUBLIC_KINDOO_SCHEDULE_PULL_FORWARD_AT
    ) ?? DEFAULT_SCHEDULE_CONFIG.pullForwardAt;

  if (pullForwardAt > nightCutoff) {
    const fallback = DEFAULT_SCHEDULE_CONFIG.pullForwardAt;
    return {
      nightCutoff,
      morningEnd,
      pullForwardAt: fallback <= nightCutoff ? fallback : nightCutoff,
    };
  }

  return { nightCutoff, morningEnd, pullForwardAt };
}

export function parseTimeToMinutes(time: string) {
  const parts = time.split(':');
  if (parts.length !== 2) return null;
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getCurrentYmdHmInTimeZone(timeZone: string, now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') ?? '';
  const month = byType.get('month') ?? '';
  const day = byType.get('day') ?? '';
  const hour = byType.get('hour') ?? '00';
  const minute = byType.get('minute') ?? '00';

  return {
    ymd: `${year}-${month}-${day}`,
    hm: `${hour}:${minute}`,
  };
}

/** Previous civil calendar day of a YYYY-MM-DD date. Not "minus 24 hours." */
export function previousCivilDate(ymd: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.UTC with a noon hour and a day of `day - 1` is civil-date arithmetic.
  // It is not a 24-hour subtraction from a zoned instant, so DST nights stay correct.
  const previous = new Date(Date.UTC(year, month - 1, day - 1, 12, 0, 0));
  const y = previous.getUTCFullYear();
  const m = String(previous.getUTCMonth() + 1).padStart(2, '0');
  const d = String(previous.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * True when a normal same-day due clock time falls in the quiet window:
 * at or after NIGHT_CUTOFF, or before MORNING_END (exclusive).
 */
export function shouldPullForward(
  normalDueHm: string,
  config: LicenseScheduleConfig = getScheduleConfig()
) {
  return normalDueHm >= config.nightCutoff || normalDueHm < config.morningEnd;
}

export function getLicenseWindowStartMinutes(startTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return null;
  return Math.max(EARLIEST_MINUTES, startMinutes - 120);
}

/**
 * When a license job becomes due for this event. The access-rule window is not
 * part of this result: only the job run time moves for early-morning events.
 *
 * Normal due is 2 hours before the license window opens (usually start - 4 hours,
 * and never earlier than 03:00 because the window itself is clamped to 05:00).
 * If that clock time is in the quiet window, due becomes PULL_FORWARD_AT on the
 * previous civil day in America/Denver.
 */
export function getJobDueAt(
  eventDate: string,
  startTime: string,
  config: LicenseScheduleConfig = getScheduleConfig()
): { ymd: string; hm: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  const windowStartMinutes = getLicenseWindowStartMinutes(startTime);
  if (windowStartMinutes === null) return null;
  const normalDueHm = minutesToTime(Math.max(0, windowStartMinutes - 120));
  if (!shouldPullForward(normalDueHm, config)) {
    return { ymd: eventDate, hm: normalDueHm };
  }
  const previous = previousCivilDate(eventDate);
  if (!previous) return null;
  return { ymd: previous, hm: config.pullForwardAt };
}

/**
 * Unix millisecond instant for a civil YYYY-MM-DD HH:mm in a named zone.
 * Used by UI countdowns so they stay correct when the browser is not on Mountain time.
 */
export function zonedCivilToUtcMs(
  ymd: string,
  hm: string,
  timeZone: string = SCHEDULE_TIMEZONE
): number {
  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const hmMatch = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!ymdMatch || !hmMatch) return Number.NaN;
  const year = Number(ymdMatch[1]);
  const month = Number(ymdMatch[2]);
  const day = Number(ymdMatch[3]);
  const hour = Number(hmMatch[1]);
  const minute = Number(hmMatch[2]);

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  const offsetMs = (instant: Date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const wallAsUtc = Date.UTC(
      Number(byType.get('year')),
      Number(byType.get('month')) - 1,
      Number(byType.get('day')),
      Number(byType.get('hour')),
      Number(byType.get('minute')),
      Number(byType.get('second'))
    );
    return wallAsUtc - instant.getTime();
  };

  // Correct once, then again in case the first guess landed on the other side of a DST fold.
  const first = asUtc - offsetMs(new Date(asUtc));
  return asUtc - offsetMs(new Date(first));
}

/** Unix ms for the job due instant in America/Denver. */
export function getJobDueTimestamp(
  eventDate: string,
  startTime: string,
  config: LicenseScheduleConfig = getScheduleConfig()
): number {
  const due = getJobDueAt(eventDate, startTime, config);
  if (!due) return Number.NaN;
  return zonedCivilToUtcMs(due.ymd, due.hm, SCHEDULE_TIMEZONE);
}

export function isDueForQueue(
  eventDate: string,
  startTime: string,
  endTime: string,
  now: Date = new Date(),
  config: LicenseScheduleConfig = getScheduleConfig()
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return false;
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return false;

  const due = getJobDueAt(eventDate, startTime, config);
  if (!due) return false;

  const current = getCurrentYmdHmInTimeZone(SCHEDULE_TIMEZONE, now);
  const nowKey = `${current.ymd}T${current.hm}`;
  const dueAtKey = `${due.ymd}T${due.hm}`;
  const endKey = `${eventDate}T${endTime}`;

  // Catch-up behavior: if the event was created after dueAt but before event end,
  // it is considered due immediately and can be queued now.
  return nowKey >= dueAtKey && nowKey <= endKey;
}

export function getLicenseWindow(eventDate: string, startTime: string, endTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return null;

  const windowStart = Math.max(EARLIEST_MINUTES, startMinutes - 120);
  const windowEnd = Math.min(LATEST_MINUTES, endMinutes + 120);

  return {
    startDate: eventDate,
    startTime: minutesToTime(windowStart),
    endDate: eventDate,
    endTime: minutesToTime(windowEnd),
  };
}

/** True while the event has not ended yet, judged in the given zone (default Mountain). */
export function eventEndsInFuture(
  eventDate: string,
  endTime: string,
  timeZone: string = SCHEDULE_TIMEZONE,
  now: Date = new Date()
) {
  const current = getCurrentYmdHmInTimeZone(timeZone, now);
  if (eventDate > current.ymd) return true;
  if (eventDate < current.ymd) return false;
  return endTime >= current.hm;
}
