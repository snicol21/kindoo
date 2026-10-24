// Scheduling rules for Kindoo license jobs, shared by schedule-due and the manual override
// (which previews what reopening an event would let the worker do).

export const SCHEDULE_TIMEZONE = 'America/Denver';
const EARLIEST_MINUTES = 5 * 60;
const LATEST_MINUTES = 23 * 60;

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

export function getCurrentYmdHmInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

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

export function getLicenseWindowStartMinutes(startTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return null;
  return Math.max(EARLIEST_MINUTES, startMinutes - 120);
}

export function isDueForQueue(eventDate: string, startTime: string, endTime: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return false;
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return false;

  const windowStartMinutes = getLicenseWindowStartMinutes(startTime);
  if (windowStartMinutes === null) return false;
  const dueTime = minutesToTime(Math.max(0, windowStartMinutes - 120));

  // Evaluate all comparisons in the business timezone to avoid host timezone drift.
  const now = getCurrentYmdHmInTimeZone(SCHEDULE_TIMEZONE);

  const nowKey = `${now.ymd}T${now.hm}`;
  const dueAtKey = `${eventDate}T${dueTime}`;
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
