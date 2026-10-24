// Pure SMS text builders. No links: each message carries the event details inline.
// Kept free of server-only imports so scripts/sms-templates-check.ts can exercise it.

const MAX_GSM_UNITS = 306; // two concatenated GSM-7 segments
const DESCRIPTION_MAX = 40;
const FIELD_MAX = 60;

const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€';

export function sanitizeGsm(value: string): string {
  const replaced = value
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  let out = '';
  for (const ch of replaced) {
    if (GSM_BASIC.includes(ch) || GSM_EXTENDED.includes(ch)) out += ch;
  }
  return out;
}

export function gsmLength(value: string): number {
  let units = 0;
  for (const ch of value) units += GSM_EXTENDED.includes(ch) ? 2 : 1;
  return units;
}

export function smsSegments(value: string): number {
  const units = gsmLength(value);
  return units <= 160 ? 1 : Math.ceil(units / 153);
}

function clean(value: string | null | undefined): string {
  if (!value) return '';
  return sanitizeGsm(value).replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-17" -> "Sat Oct 17" (no timezone shifting). */
export function formatEventDate(eventDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate.trim());
  if (!match) return clean(eventDate);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12) return clean(eventDate);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAYS[weekday]} ${MONTHS[month - 1]} ${day}`;
}

function parseTime(value: string): { h: number; m: number; mer: 'AM' | 'PM' } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { h: hours % 12 === 0 ? 12 : hours % 12, m: minutes, mer: hours < 12 ? 'AM' : 'PM' };
}

/** "18:00","21:00" -> "6:00-9:00 PM"; "11:00","13:00" -> "11:00 AM-1:00 PM". */
export function formatTimeRange(startTime: string, endTime: string): string {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (!start || !end) return `${clean(startTime)}-${clean(endTime)}`;
  const fmt = (t: { h: number; m: number }) => `${t.h}:${String(t.m).padStart(2, '0')}`;
  return start.mer === end.mer
    ? `${fmt(start)}-${fmt(end)} ${end.mer}`
    : `${fmt(start)} ${start.mer}-${fmt(end)} ${end.mer}`;
}

export type FailureKind =
  | 'already-exists'
  | 'time-passed'
  | 'user-not-found'
  | 'sign-in'
  | 'slow'
  | 'unexpected';

/** Sort raw worker failure details into one of a few kinds. Never echoes raw text. */
export function classifyFailure(details: string | null | undefined): FailureKind {
  const text = (details ?? '').toLowerCase();
  if (/expiry date already expired/.test(text)) return 'time-passed';
  if (/already (exists|licensed|active)|existing[- ]active[- ]license/.test(text))
    return 'already-exists';
  if (/user not found|no (matching )?user|not found in kindoo/.test(text)) return 'user-not-found';
  if (/login|password|username|authenticat|sign[- ]?in/.test(text)) return 'sign-in';
  if (/timeout|timed out|exceeded .*ms|selector|not visible|unable to open|did not become ready|not clickable/.test(text))
    return 'slow';
  return 'unexpected';
}

const FAILURE_WHY: Record<FailureKind, string> = {
  'already-exists': 'Kindoo already shows access for this person.',
  'time-passed': 'Kindoo saw this time as already past.',
  'user-not-found': 'this email was not found in Kindoo.',
  'sign-in': 'Kindoo sign-in timed out.',
  slow: 'Kindoo was slow to respond.',
  unexpected: 'something unexpected happened.',
};

/** The plain-English reason shown on the "Why:" line of a failure text. */
export function friendlyFailureReason(details: string | null | undefined): string {
  return FAILURE_WHY[classifyFailure(details)];
}

/** How Kindoo access will (or will not) be added for a new booking. */
export type KindooAccessPlan =
  | 'automatic'
  | 'automatic-soon'
  | 'no-email'
  | 'unsupported-building'
  | 'ended';

export interface EventSmsInput {
  description?: string | null;
  eventType?: string | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  building?: string | null;
  ward?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
}

function detailWhere(input: EventSmsInput, fieldMax: number): string {
  const building = truncate(clean(input.building), Math.min(40, fieldMax));
  return building && `Where: ${building}`;
}

function titleLine(input: EventSmsInput, descMax: number): string {
  const eventType = clean(input.eventType) || 'Private';
  const description = descMax > 0 ? truncate(clean(input.description), descMax) : '';
  return description ? `${description} (${eventType} event)` : `${eventType} event`;
}

function whenLine(input: EventSmsInput): string {
  return `When: ${formatEventDate(input.eventDate)}, ${formatTimeRange(input.startTime, input.endTime)} MT`;
}

function joinLines(lines: Array<string | null | undefined | false>): string {
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

/** Build with a shrinking description, then shrinking name, ward and building fields, until within the limit (2 GSM-7 segments by default). The closing action line is never cut. */
function fitToLimit(
  build: (descMax: number, fieldMax: number) => string,
  maxUnits: number = MAX_GSM_UNITS
): string {
  let descMax = DESCRIPTION_MAX;
  let fieldMax = FIELD_MAX;
  let message = build(descMax, fieldMax);
  while (gsmLength(message) > maxUnits && descMax > 10) {
    descMax -= 5;
    message = build(descMax, fieldMax);
  }
  while (gsmLength(message) > maxUnits && fieldMax > 10) {
    fieldMax -= 5;
    message = build(descMax, fieldMax);
  }
  if (gsmLength(message) > maxUnits) {
    // Last resort before cutting: leave the free-text description out.
    message = build(0, fieldMax);
  }
  return gsmLength(message) > maxUnits ? message.slice(0, maxUnits - 3) + '...' : message;
}

const NEW_BOOKING_ACTION_LINES: Record<KindooAccessPlan, string> = {
  automatic:
    'Nothing needed from you. Door access is added in Kindoo automatically, usually about 4 hours before the start.',
  'automatic-soon':
    'Nothing needed from you. Door access is added in Kindoo automatically, usually soon since the event is close.',
  'no-email':
    'Door access will not be added automatically (no contact email). Please add one in DigitalFob, or add access in Kindoo.',
  'unsupported-building':
    'Door access is not added automatically for this building. Please add access in Kindoo if it is needed.',
  ended: 'Door access is not added automatically because this event has already ended.',
};

export function buildEventCreatedSms(input: EventSmsInput & { accessPlan?: KindooAccessPlan }): string {
  const actionLine = NEW_BOOKING_ACTION_LINES[input.accessPlan ?? 'automatic'];
  return fitToLimit((descMax, fieldMax) => {
    const name = truncate(clean(input.contactName), Math.min(40, fieldMax));
    const phone = truncate(clean(input.contactPhone), 24);
    const forText = [name, phone].filter(Boolean).join(', ');
    const ward = truncate(clean(input.ward), Math.min(40, fieldMax));
    const building = truncate(clean(input.building), Math.min(40, fieldMax));
    return joinLines([
      'DigitalFob: New booking added',
      titleLine(input, descMax),
      forText && `For: ${forText}`,
      ward && `Ward: ${ward}`,
      building && `Where: ${building}`,
      whenLine(input),
      actionLine,
    ]);
  });
}

function forNameWard(input: EventSmsInput, max = 40): string {
  const parts = [truncate(clean(input.contactName), max), truncate(clean(input.ward), max)].filter(
    Boolean
  );
  return parts.length ? `For: ${parts.join(', ')}` : '';
}

export function buildLicenseJobCompletedSms(input: EventSmsInput): string {
  return fitToLimit((descMax, fieldMax) =>
    joinLines([
      'DigitalFob: Door access is set up',
      titleLine(input, descMax),
      forNameWard(input, Math.min(40, fieldMax)),
      detailWhere(input, fieldMax),
      whenLine(input),
      'Nothing needed from you. Access works from about 2 hours before the start until about 2 hours after the end.',
    ])
  );
}

const RETRY_OR_KINDOO = 'tap Retry on this event in DigitalFob, or add access in Kindoo.';

function failureActionLine(kind: FailureKind, afterStart: boolean): string {
  const when = afterStart ? 'as soon as you can' : 'before the event starts';
  switch (kind) {
    case 'user-not-found':
      return `Please fix the email on the booking in DigitalFob ${when}, then tap Retry.`;
    case 'time-passed':
      return 'Please check the date and time on the booking in DigitalFob, then tap Retry.';
    default:
      return `Please do one of these ${when}: ${RETRY_OR_KINDOO}`;
  }
}

/**
 * Text for a failed Kindoo job. `afterStart` switches the deadline wording once the event has
 * started. "Access already exists" is not a failure, so it gets its own reassuring text.
 */
export function buildLicenseJobFailedSms(
  input: EventSmsInput & { details?: string | null; afterStart?: boolean }
): string {
  const kind = classifyFailure(input.details);
  if (kind === 'already-exists') {
    return fitToLimit((descMax, fieldMax) =>
      joinLines([
        'DigitalFob: Door access already exists',
        titleLine(input, descMax),
        forNameWard(input, Math.min(40, fieldMax)),
        detailWhere(input, fieldMax),
        whenLine(input),
        'Kindoo already shows access for this person, so nothing was added.',
        'Nothing needed from you. You can confirm in Kindoo if you like.',
      ])
    );
  }
  return fitToLimit((descMax, fieldMax) =>
    joinLines([
      'DigitalFob: Door access was not set up',
      titleLine(input, descMax),
      forNameWard(input, Math.min(40, fieldMax)),
      detailWhere(input, fieldMax),
      whenLine(input),
      `Why: ${FAILURE_WHY[kind]}`,
      failureActionLine(kind, input.afterStart === true),
    ])
  );
}

const ONE_SEGMENT_UNITS = 160;

/** Kept to 1 segment: long names or emails are shortened, then the closing "No rush." is dropped. */
export function buildAccessRequestSubmittedSms(input: {
  name: string;
  ward?: string | null;
  email?: string | null;
}): string {
  const ward = truncate(clean(input.ward), 40);
  const build = (nameMax: number, emailMax: number, closing: string) =>
    joinLines([
      'DigitalFob: New access request',
      clean(input.name) && `From: ${truncate(clean(input.name), nameMax)}`,
      ward && `Ward: ${ward}`,
      clean(input.email) && `Email: ${truncate(clean(input.email), emailMax)}`,
      closing,
    ]);
  const full = 'Please approve or deny it in DigitalFob when you can. No rush.';
  const short = 'Please approve or deny it in DigitalFob when you can.';
  for (const closing of [full, short]) {
    for (const [nameMax, emailMax] of [
      [60, 80],
      [40, 50],
      [30, 40],
      [24, 32],
      [20, 26],
    ]) {
      const message = build(nameMax, emailMax, closing);
      if (gsmLength(message) <= ONE_SEGMENT_UNITS) return message;
    }
  }
  return fitToLimit(() => build(20, 26, short), ONE_SEGMENT_UNITS);
}

// ─── Handled manually (admin override) ───────────────────────────────────────
// Wording for the texts sent when an admin marks an event as handled manually and when they
// reopen it. Kept here, next to the other templates, so all SMS wording can be reviewed and
// reworded in one place. Never include the admin's note or any internal detail.

export type HandledManuallyReason = 'worker_offline' | 'granted_directly' | 'not_needed' | 'other';

const HANDLED_MANUALLY_REASON_LINES: Record<HandledManuallyReason, string> = {
  worker_offline: 'Access was handled by hand because automation was unavailable.',
  granted_directly: 'Access was granted directly in Kindoo.',
  not_needed: 'Kindoo access is not needed for this event.',
  other: 'Access is being handled by hand.',
};

export function buildEventHandledManuallySms(
  input: EventSmsInput & { reason: HandledManuallyReason }
): string {
  const building = truncate(clean(input.building), 40);
  const reasonLine =
    HANDLED_MANUALLY_REASON_LINES[input.reason] ?? HANDLED_MANUALLY_REASON_LINES.other;
  const headline =
    input.reason === 'not_needed'
      ? 'DigitalFob: No Kindoo access needed'
      : 'DigitalFob: Kindoo access is taken care of';
  return fitToLimit((descMax) =>
    joinLines([
      headline,
      titleLine(input, descMax),
      forNameWard(input),
      building && `Where: ${building}`,
      whenLine(input),
      reasonLine,
      'Nothing needed from you. Automation will skip this event.',
    ])
  );
}

export function buildEventHandledManuallyReopenedSms(input: EventSmsInput): string {
  const building = truncate(clean(input.building), 40);
  return fitToLimit((descMax) =>
    joinLines([
      'DigitalFob: Correction, access is automatic',
      titleLine(input, descMax),
      forNameWard(input),
      building && `Where: ${building}`,
      whenLine(input),
      'Please disregard our earlier text.',
      'Access will be set up as usual, about 4 hours before the event. Nothing needed from you.',
    ])
  );
}
