export function parseTimeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
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
