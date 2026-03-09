export function parseTimeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export const TIME_SLOT_INTERVAL_MINUTES = 15;
export const EARLIEST_EVENT_MINUTES = 5 * 60;
export const LATEST_EVENT_MINUTES = 23 * 60;

export function minutesToTime(minutes: number) {
  const normalized = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function buildTimeOptions(
  startMinutes: number,
  endMinutes: number = LATEST_EVENT_MINUTES,
  intervalMinutes: number = TIME_SLOT_INTERVAL_MINUTES
) {
  const options: string[] = [];
  const normalizedStart = Math.max(0, Math.min(startMinutes, endMinutes));
  for (let minutes = normalizedStart; minutes <= endMinutes; minutes += intervalMinutes) {
    options.push(minutesToTime(minutes));
  }
  return options;
}

export function validateTimeWindow(startTime: string, endTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const earliestMinutes = 5 * 60;
  const latestMinutes = 23 * 60;
  if (startMinutes === null || endMinutes === null) {
    return 'Start and end times are required.';
  }
  if (startMinutes < earliestMinutes || startMinutes > latestMinutes) {
    return 'Start time must be between 5:00 AM and 11:00 PM.';
  }
  if (endMinutes > latestMinutes) {
    return 'End time must be no later than 11:00 PM.';
  }
  if (endMinutes <= startMinutes) {
    return 'End time must be after start time.';
  }
  return null;
}

export function formatTime(timeStr: string) {
  const [hours, minutes] = timeStr.split(':').map((value) => Number(value));
  const dt = new Date();
  dt.setHours(hours, minutes, 0, 0);
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatTimeRange(startTime: string, endTime: string) {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}
