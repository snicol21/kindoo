import {
  getCurrentYmdHmInTimeZone,
  getJobDueAt,
  minutesToTime,
  parseTimeToMinutes,
  SCHEDULE_TIMEZONE,
} from '@/lib/license-schedule';
import type { KindooAccessPlan } from '@/lib/sms-message-templates';

const SUPPORTED_BUILDINGS = ['Stake Center', 'Maples Building'];

/** True once the event's start time has passed, in Mountain time (the business time zone). */
export function hasEventStarted(eventDate: string, startTime: string, now: Date = new Date()) {
  const start = parseTimeToMinutes(startTime);
  if (start === null) return false;
  const current = getCurrentYmdHmInTimeZone(SCHEDULE_TIMEZONE, now);
  return `${current.ymd}T${current.hm}` >= `${eventDate}T${minutesToTime(start)}`;
}

/**
 * What the Kindoo automation will do for a new booking, mirroring the rules in
 * `schedule-due`: a job needs a contact email and a building with an access rule, is created
 * about 4 hours before the start (2 hours before the license window opens, which is never
 * earlier than 5:00 AM), or at 9:00 PM the evening before when that due time would fall in
 * the quiet window (at or after 9:00 PM, or before 8:00 AM), is caught up on the next worker
 * pass when the booking is made after that point, and is never created once the event has
 * ended. The access rule's start and end times are not moved, only the job run time.
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
  const start = parseTimeToMinutes(input.startTime);
  const end = parseTimeToMinutes(input.endTime);
  if (start === null || end === null) return 'automatic';

  const current = getCurrentYmdHmInTimeZone(SCHEDULE_TIMEZONE, now);
  const nowKey = `${current.ymd}T${current.hm}`;
  if (nowKey > `${input.eventDate}T${minutesToTime(end)}`) return 'ended';
  const due = getJobDueAt(input.eventDate, input.startTime);
  if (!due) return 'automatic';
  return nowKey >= `${due.ymd}T${due.hm}` ? 'automatic-soon' : 'automatic';
}
