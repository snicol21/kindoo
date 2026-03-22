import 'server-only';

interface EventWindowInput {
  eventType: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  building: string;
  ward: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

function getAppBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}

function withAppLink(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getAppBaseUrl()}${normalizedPath}`;
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
}

export function buildAccessRequestSubmittedSms(input: { name: string; ward: string }) {
  const safeName = truncate(compactWhitespace(input.name), 60);
  const safeWard = truncate(compactWhitespace(input.ward), 40);
  return compactWhitespace(
    `DigitalFob: New access request from ${safeName} (${safeWard}). Review: ${withAppLink('/admin/users')}`
  );
}

export function buildEventCreatedSms(input: EventWindowInput) {
  const eventType = truncate(compactWhitespace(input.eventType), 30);
  const eventDate = truncate(compactWhitespace(input.eventDate), 20);
  const startTime = truncate(compactWhitespace(input.startTime), 10);
  const endTime = truncate(compactWhitespace(input.endTime), 10);
  const building = truncate(compactWhitespace(input.building), 40);
  const ward = truncate(compactWhitespace(input.ward), 40);

  const contactName = input.contactName ? truncate(compactWhitespace(input.contactName), 60) : '';
  const contactPhone = input.contactPhone
    ? truncate(compactWhitespace(input.contactPhone), 24)
    : '';
  const contactEmail = input.contactEmail
    ? truncate(compactWhitespace(input.contactEmail), 80)
    : '';

  const contactParts = [
    contactName ? `For ${contactName}` : '',
    contactPhone ? `Phone ${contactPhone}` : '',
    contactEmail ? `Email ${contactEmail}` : '',
  ].filter(Boolean);

  const contactText = contactParts.length > 0 ? `${contactParts.join('; ')}.` : '';

  return compactWhitespace(
    `DigitalFob: New ${eventType} event ${eventDate} ${startTime}-${endTime}, ${building} (${ward}). ${contactText} View: ${withAppLink('/dashboard')}`
  );
}

export function buildLicenseJobCompletedSms(input: {
  completionType: string;
  timeWindow: string;
  eventId: string;
}) {
  const completionType = truncate(compactWhitespace(input.completionType.replaceAll('-', ' ')), 40);
  const timeWindow = truncate(compactWhitespace(input.timeWindow), 100);
  const eventId = truncate(compactWhitespace(input.eventId), 12);

  return compactWhitespace(
    `DigitalFob: Kindoo job completed (${completionType}) for ${timeWindow}. Ref ${eventId}. View: ${withAppLink('/dashboard')}`
  );
}

export function buildLicenseJobFailedSms(input: {
  timeWindow: string;
  details: string;
  eventId: string;
}) {
  const timeWindow = truncate(compactWhitespace(input.timeWindow), 100);
  const details = truncate(compactWhitespace(input.details), 140);
  const eventId = truncate(compactWhitespace(input.eventId), 12);

  return compactWhitespace(
    `DigitalFob: Kindoo job failed for ${timeWindow}. Ref ${eventId}. Error: ${details}. Review: ${withAppLink('/dashboard')}`
  );
}
