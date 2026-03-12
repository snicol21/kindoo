import type { EventWithCreator } from '@/actions/events';
import {
  DEFAULT_MESSAGE_TEMPLATES,
  DEFAULT_POLICY_LINK,
  type MessageTemplateKey,
  type MessageTemplateMap,
} from '@/lib/message-templates';
import { formatDate, formatDateNoYear, toLocalDateTime } from '@/utils/dateUtils';
import { formatPhone } from '@/utils/phoneUtils';
import { formatTime, formatTimeRange, minutesToTime, parseTimeToMinutes } from '@/utils/timeUtils';

function formatLicenseDate(ymd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function formatLicenseTime(minutes: number) {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

function getLicenseWindowMinutes(event: EventWithCreator) {
  const startMinutes = parseTimeToMinutes(event.startTime);
  const endMinutes = parseTimeToMinutes(event.endTime);
  if (startMinutes === null || endMinutes === null) return null;
  const earliestMinutes = 5 * 60;
  const latestMinutes = 23 * 60;
  return {
    start: Math.max(earliestMinutes, startMinutes - 120),
    end: Math.min(latestMinutes, endMinutes + 120),
  };
}

export function getLicenseTimes(event: EventWithCreator) {
  const window = getLicenseWindowMinutes(event);
  if (!window) return null;
  return {
    startDate: formatLicenseDate(event.eventDate),
    startTime: formatLicenseTime(window.start),
    endDate: formatLicenseDate(event.eventDate),
    endTime: formatLicenseTime(window.end),
  };
}

export function getLicenseWindowEndTimestamp(event: EventWithCreator) {
  const window = getLicenseWindowMinutes(event);
  if (!window) return Number.NaN;
  return toLocalDateTime(event.eventDate, minutesToTime(window.end));
}

function getFirstName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] || fullName;
}

function buildTemplateContext(event: EventWithCreator) {
  const firstName = getFirstName(event.contactName);
  const dateShort = formatDateNoYear(event.eventDate);
  const dateLong = formatDate(event.eventDate);
  const timeRange = formatTimeRange(event.startTime, event.endTime);
  const phone = formatPhone(event.contactPhone) || '—';
  const email = event.contactEmail?.trim() ? event.contactEmail : '—';
  const licenseTimes = getLicenseTimes(event);
  const licenseWindow = licenseTimes
    ? licenseTimes.startDate === licenseTimes.endDate
      ? `${licenseTimes.startDate} (${licenseTimes.startTime} – ${licenseTimes.endTime})`
      : `${licenseTimes.startDate} ${licenseTimes.startTime} – ${licenseTimes.endDate} ${licenseTimes.endTime}`
    : '';

  return {
    '{firstName}': firstName,
    '{fullName}': event.contactName,
    '{building}': event.building,
    '{ward}': event.contactWard ?? '—',
    '{eventDate}': dateShort,
    '{eventDateLong}': dateLong,
    '{startTime}': formatTime(event.startTime),
    '{endTime}': formatTime(event.endTime),
    '{timeRange}': timeRange,
    '{description}': event.description,
    '{email}': email,
    '{phone}': phone,
    '{policyLink}': DEFAULT_POLICY_LINK,
    '{licenseStartDate}': licenseTimes?.startDate ?? '',
    '{licenseStartTime}': licenseTimes?.startTime ?? '',
    '{licenseEndDate}': licenseTimes?.endDate ?? '',
    '{licenseEndTime}': licenseTimes?.endTime ?? '',
    '{licenseWindow}': licenseWindow,
  };
}

function applyTemplate(template: string, context: Record<string, string>) {
  return template.replace(/\{[a-zA-Z0-9_]+\}/g, (token) => context[token] ?? token);
}

export function renderMessageTemplate(
  event: EventWithCreator,
  key: MessageTemplateKey,
  templates?: MessageTemplateMap
) {
  const template = templates?.[key];
  const resolvedTemplate = template?.trim() ? template : (DEFAULT_MESSAGE_TEMPLATES[key] ?? '');
  return applyTemplate(resolvedTemplate, buildTemplateContext(event));
}
