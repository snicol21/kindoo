import {
  ASSIGNABLE_WARDS,
  WARD_BUILDING,
  type AssignableWard,
  type Building,
} from '@/schema/schema';

export const TEMPLATE_HEADERS = [
  'Building',
  'Ward',
  'Event Type',
  'Member Name',
  'Event Date',
  'Start Time',
  'End Time',
  'Email',
  'Phone',
  'Event Description',
];

export const WARD_BUILDING_MAP: Record<AssignableWard, Building> = Object.fromEntries(
  ASSIGNABLE_WARDS.map((ward) => [ward, WARD_BUILDING[ward] ?? 'Stake Center'])
) as Record<AssignableWard, Building>;

export const TEMPLATE_SAMPLE_ROWS = ASSIGNABLE_WARDS.map((ward, index) => [
  WARD_BUILDING_MAP[ward],
  ward,
  'Private',
  `Sample Member ${index + 1}`,
  '{tomorrow}',
  '18:00',
  '19:30',
  `sample${index + 1}@example.com`,
  '555-123-4567',
  `Sample event for ${WARD_BUILDING_MAP[ward]} ${ward}.`,
]);
