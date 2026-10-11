// Pure SMS text builders. No links: each message carries the event details inline.
// Kept free of server-only imports so scripts/sms-templates-check.ts can exercise it.

const MAX_GSM_UNITS = 306; // two concatenated GSM-7 segments
const DESCRIPTION_MAX = 40;
const REASON_MAX = 60;

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

/** Map raw worker failure details to a short, friendly reason. Never echoes raw text. */
export function friendlyFailureReason(details: string | null | undefined): string {
  const text = (details ?? '').toLowerCase();
  if (/expiry date already expired/.test(text)) return 'Event time already passed in Kindoo';
  if (/already (exists|licensed|active)|existing[- ]active[- ]license/.test(text))
    return 'Access already exists';
  if (/user not found|no (matching )?user|not found in kindoo/.test(text))
    return 'Kindoo user not found';
  if (/login|password|username|authenticat|sign[- ]?in/.test(text))
    return 'Kindoo login timed out';
  if (/timeout|timed out|exceeded .*ms|selector|not visible|unable to open|did not become ready|not clickable/.test(text))
    return 'Kindoo page timed out';
  return 'Automation error, see dashboard';
}

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

function titleLine(input: EventSmsInput, descMax: number): string {
  const eventType = clean(input.eventType) || 'Private';
  const description = truncate(clean(input.description), descMax);
  return description ? `${description} (${eventType} event)` : `${eventType} event`;
}

function whenLine(input: EventSmsInput): string {
  return `When: ${formatEventDate(input.eventDate)}, ${formatTimeRange(input.startTime, input.endTime)} MT`;
}

function joinLines(lines: Array<string | null | undefined | false>): string {
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

/** Build with shrinking description (then reason) until within 2 GSM-7 segments. */
function fitToLimit(build: (descMax: number, reasonMax: number) => string): string {
  let descMax = DESCRIPTION_MAX;
  let reasonMax = REASON_MAX;
  let message = build(descMax, reasonMax);
  while (gsmLength(message) > MAX_GSM_UNITS && descMax > 10) {
    descMax -= 5;
    message = build(descMax, reasonMax);
  }
  while (gsmLength(message) > MAX_GSM_UNITS && reasonMax > 15) {
    reasonMax -= 5;
    message = build(descMax, reasonMax);
  }
  return gsmLength(message) > MAX_GSM_UNITS ? message.slice(0, MAX_GSM_UNITS - 3) + '...' : message;
}

export function buildEventCreatedSms(input: EventSmsInput): string {
  const name = truncate(clean(input.contactName), 40);
  const phone = truncate(clean(input.contactPhone), 24);
  const forText = [name, phone].filter(Boolean).join(', ');
  const ward = truncate(clean(input.ward), 40);
  const building = truncate(clean(input.building), 40);
  return fitToLimit((descMax) =>
    joinLines([
      'DigitalFob: New booking',
      titleLine(input, descMax),
      forText && `For: ${forText}`,
      ward && `Ward: ${ward}`,
      building && `Where: ${building}`,
      whenLine(input),
      'Status: Booked, Kindoo access pending',
    ])
  );
}

function forNameWard(input: EventSmsInput): string {
  const parts = [truncate(clean(input.contactName), 40), truncate(clean(input.ward), 40)].filter(
    Boolean
  );
  return parts.length ? `For: ${parts.join(', ')}` : '';
}

export function buildLicenseJobCompletedSms(input: EventSmsInput): string {
  const building = truncate(clean(input.building), 40);
  return fitToLimit((descMax) =>
    joinLines([
      'DigitalFob: Kindoo access READY',
      titleLine(input, descMax),
      forNameWard(input),
      building && `Where: ${building}`,
      whenLine(input),
      'Temporary license is set for this time.',
    ])
  );
}

export function buildLicenseJobFailedSms(input: EventSmsInput & { details?: string | null }): string {
  const building = truncate(clean(input.building), 40);
  const reason = friendlyFailureReason(input.details);
  return fitToLimit((descMax, reasonMax) =>
    joinLines([
      'DigitalFob: Kindoo access FAILED',
      titleLine(input, descMax),
      forNameWard(input),
      building && `Where: ${building}`,
      whenLine(input),
      `Reason: ${truncate(reason, reasonMax)}`,
      'Next: Retry in Kindoo or set access by hand.',
    ])
  );
}

export function buildAccessRequestSubmittedSms(input: {
  name: string;
  ward?: string | null;
  email?: string | null;
}): string {
  const name = truncate(clean(input.name), 60);
  const ward = truncate(clean(input.ward), 40);
  const email = truncate(clean(input.email), 80);
  return fitToLimit(() =>
    joinLines([
      'DigitalFob: New access request',
      name && `From: ${name}`,
      ward && `Ward: ${ward}`,
      email && `Email: ${email}`,
      'Open DigitalFob to approve or deny.',
    ])
  );
}
