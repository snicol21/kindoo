import type { AddEventInput } from '@/actions/events';

export type CsvParseResult = {
  events: AddEventInput[];
  errors: string[];
};
