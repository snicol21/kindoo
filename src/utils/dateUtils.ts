export function parseYmd(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

export function isFutureDate(ymd: string) {
  const parsed = parseYmd(ymd);
  if (!parsed) return false;

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  return targetUtc > todayUtc;
}

export function toLocalDate(dateStr: string) {
  const parsed = parseYmd(dateStr);
  if (parsed) {
    return new Date(parsed.year, parsed.month - 1, parsed.day);
  }
  const fallback = new Date(dateStr);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function toLocalDateTime(dateStr: string, timeStr: string) {
  const date = toLocalDate(dateStr);
  if (!date) return Number.NaN;
  const [hours, minutes] = timeStr.split(':').map((value) => Number(value));
  const safeHours = Number.isFinite(hours) ? hours : 0;
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  date.setHours(safeHours, safeMinutes, 0, 0);
  return date.getTime();
}

export function formatDate(dateStr: string) {
  const date = toLocalDate(dateStr);
  if (!date) return dateStr;

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateNoYear(dateStr: string) {
  const date = toLocalDate(dateStr);
  if (!date) return dateStr;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function getDaysUntil(dateStr: string) {
  const parsed = parseYmd(dateStr);
  if (!parsed) return '—';

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const diff = Math.floor((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return '1 day';
  return `${diff} days`;
}

export function getDaysUntilValue(dateStr: string) {
  const parsed = parseYmd(dateStr);
  if (!parsed) return Number.NaN;

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  return Math.floor((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

export function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTomorrowYmd() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatYmd(tomorrow);
}
