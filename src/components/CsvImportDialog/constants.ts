import { WARDS, type Building, type Ward } from '@/schema/schema';

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

export const WARD_BUILDING_MAP: Record<Ward, Building> = {
  '1st Ward': 'Maples Building',
  '2nd Ward': 'Maples Building',
  '3rd Ward': 'Stake Center',
  '4th Ward': 'Stake Center',
  '5th Ward': 'Maples Building',
  '6th Ward': 'Stake Center',
  'Park Ridge Ward': 'Maples Building',
};

export const TEMPLATE_SAMPLE_ROWS = WARDS.map((ward, index) => [
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
