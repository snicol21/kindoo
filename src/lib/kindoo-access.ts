import type { KindooAccessPlan } from '@/lib/sms-message-templates';

const BUSINESS_TIMEZONE = 'America/Denver';
const EARLIEST_MINUTES = 5 * 60;
const SUPPORTED_BUILDINGS = ['Stake Center', 'Maples Building'];

function denverNowKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}T${byType.get('hour')}:${byType.get('minute')}`;
}

function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(minutes) ? minutes : null;
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** True once the event's start time has passed, in Mountain time (the business time zone). */
export function hasEventStarted(eventDate: string, startTime: string, now: Date = new Date()) {
  const start = toMinutes(startTime);
  if (start === null) return false;
  return denverNowKey(now) >= `${eventDate}T${toTime(start)}`;
}

/**
 * What the Kindoo automation will do for a new booking, mirroring the rules in
 * `schedule-due`: a job needs a contact email and a building with an access rule, is created
 * about 4 hours before the start (2 hours before the license window opens, which is never
 * earlier than 5:00 AM), is caught up on the next worker pass when the booking is made after
 * that point, and is never created once the event has ended.
 */
export function getKindooAccessPlan(
  input: {
    building: string;
    contactEmail?: string | null;
    eventDate: string;
    startTime: string;
    endTime: string;
  },
  now: Date = new Date()
): KindooAccessPlan {
  if (!input.contactEmail?.trim()) return 'no-email';
  if (!SUPPORTED_BUILDINGS.includes(input.building)) return 'unsupported-building';
  const start = toMinutes(input.startTime);
  const end = toMinutes(input.endTime);
  if (start === null || end === null) return 'automatic';

  const nowKey = denverNowKey(now);
  if (nowKey > `${input.eventDate}T${toTime(end)}`) return 'ended';
  const dueMinutes = Math.max(0, Math.max(EARLIEST_MINUTES, start - 120) - 120);
  return nowKey >= `${input.eventDate}T${toTime(dueMinutes)}` ? 'automatic-soon' : 'automatic';
}
