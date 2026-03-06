import { TEMPLATE_PLACEHOLDERS, type MessageTemplateKey } from '@/lib/message-templates';

export const PLACEHOLDER_LOOKUP = TEMPLATE_PLACEHOLDERS.reduce(
  (acc, placeholder) => {
    acc[placeholder.token] = placeholder;
    return acc;
  },
  {} as Record<string, (typeof TEMPLATE_PLACEHOLDERS)[number]>
);

export const TOKEN_HIGHLIGHT_CLASS =
  'rounded-sm bg-emerald-100/70 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100';

export const PLACEHOLDER_EXAMPLES: Record<string, string> = {
  '{firstName}': 'Alex',
  '{fullName}': 'Alex Johnson',
  '{building}': 'Stake Center',
  '{ward}': '2nd Ward',
  '{eventDate}': 'Mar 18',
  '{eventDateLong}': 'Mar 18, 2026',
  '{startTime}': '6:00 PM',
  '{endTime}': '8:00 PM',
  '{timeRange}': '6:00 PM – 8:00 PM',
  '{description}': 'Wedding reception',
  '{email}': 'alex@example.com',
  '{phone}': '(555) 123-4567',
  '{policyLink}': 'https://drive.google.com/…',
  '{licenseStartDate}': '03/18/2026',
  '{licenseStartTime}': '4:00 PM',
  '{licenseEndDate}': '03/18/2026',
  '{licenseEndTime}': '10:00 PM',
  '{licenseWindow}': '03/18/2026 (4:00 PM – 10:00 PM)',
};

export const EMPTY_PLACEHOLDER_SELECTION: Record<MessageTemplateKey, string> = {
  availability_inquiry: '',
  calendar_item: '',
  availability_confirmed: '',
  license_created: '',
};

export const TEMPLATE_TEXTAREA_ROWS: Record<MessageTemplateKey, number> = {
  availability_inquiry: 3,
  calendar_item: 3,
  availability_confirmed: 4,
  license_created: 3,
};
