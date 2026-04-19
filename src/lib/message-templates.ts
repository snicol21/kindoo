export type MessageTemplateKey =
  | 'availability_inquiry'
  | 'calendar_item'
  | 'availability_confirmed'
  | 'license_created';

export interface MessageTemplateDefinition {
  key: MessageTemplateKey;
  title: string;
  description: string;
}

export interface MessageTemplatePlaceholder {
  token: string;
  description: string;
}

export const DEFAULT_POLICY_LINK =
  'https://docs.google.com/document/d/18Yw3mZ5LuYj6uVmAkIV3o8P9ex3ITndQ/edit?usp=drivesdk&ouid=115140667897594874906&rtpof=true&sd=true';

export const MESSAGE_TEMPLATE_DEFINITIONS: MessageTemplateDefinition[] = [
  {
    key: 'availability_inquiry',
    title: 'Availability inquiry text',
    description: 'Initial response while you check the calendar.',
  },
  {
    key: 'calendar_item',
    title: 'Calendar item description',
    description: 'Internal notes used when creating the calendar item.',
  },
  {
    key: 'availability_confirmed',
    title: 'Availability confirmed + policy text',
    description: 'Confirmation plus the meetinghouse use policy link.',
  },
  {
    key: 'license_created',
    title: 'Temporary license created text',
    description: 'Sent once a temporary Kindoo license is created.',
  },
];

export const MESSAGE_TEMPLATE_KEYS = MESSAGE_TEMPLATE_DEFINITIONS.map((template) => template.key);

export const EMPTY_MESSAGE_TEMPLATES: Record<MessageTemplateKey, string> =
  MESSAGE_TEMPLATE_KEYS.reduce(
    (acc, key) => {
      acc[key] = '';
      return acc;
    },
    {} as Record<MessageTemplateKey, string>
  );

export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateKey, string> = {
  availability_inquiry:
    "Hey {firstName}, thanks for reaching out. Let me check the calendar to see if we have some availability for your private event ({description}) on {eventDate} ({timeRange}) at the {building}. I'll follow up as soon as I confirm availability.",
  calendar_item:
    'Member: {fullName}\nEvent details: {description}\nWard: {ward}\nPhone: {phone}\nEmail: {email}',
  availability_confirmed:
    '{firstName}, I was able to confirm availability for your private event on {eventDate} from {timeRange} at the {building}.\n\nWe will need your email address that you use on your church membership record so we can issue your temporary Kindoo access.\n\nAlso we require you to please review the Stake Meetinghouse Use Policies here:\n{policyLink}',
  license_created:
    "Hi {firstName}, we just created a temporary Kindoo license for you. Your access window is {licenseWindow}. You should receive an invitation email shortly with a link to download the app. After installing, sign in with the same email/Church account. You'll be prompted to allow Bluetooth and Location on your phone\u2014these permissions let the app detect the door so the Open button works. At the entrance, open the app and tap Open to unlock the door.",
};

export const TEMPLATE_PLACEHOLDERS: MessageTemplatePlaceholder[] = [
  { token: '{firstName}', description: 'First name from the member name' },
  { token: '{fullName}', description: 'Full member name' },
  { token: '{building}', description: 'Stake Center or Maples Building' },
  { token: '{ward}', description: 'Ward selection' },
  { token: '{eventDate}', description: 'Event date (short, no year)' },
  { token: '{eventDateLong}', description: 'Event date with year' },
  { token: '{startTime}', description: 'Formatted start time' },
  { token: '{endTime}', description: 'Formatted end time' },
  { token: '{timeRange}', description: 'Start and end time range' },
  { token: '{description}', description: 'Event description' },
  { token: '{email}', description: 'Member email' },
  { token: '{phone}', description: 'Member phone' },
  { token: '{policyLink}', description: 'Stake meetinghouse use policies link' },
  { token: '{licenseStartDate}', description: 'License start date' },
  { token: '{licenseStartTime}', description: 'License start time' },
  { token: '{licenseEndDate}', description: 'License end date' },
  { token: '{licenseEndTime}', description: 'License end time' },
  { token: '{licenseWindow}', description: 'License date + time range' },
];

export type MessageTemplateMap = Record<MessageTemplateKey, string>;
