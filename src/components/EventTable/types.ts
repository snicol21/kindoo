import type { AddEventInput, EventWithCreator, UpdateEventInput } from '@/actions/events';
import type { MessageTemplateMap } from '@/lib/message-templates';

export interface EventTableProps {
  events: EventWithCreator[];
  isLoading: boolean;
  isError: boolean;
  building: string;
  emptyStateTitle?: string;
  emptyStateMessage?: string;
  messageTemplates?: MessageTemplateMap;
  onDelete?: (eventId: string) => Promise<void>;
  onEdit?: (input: UpdateEventInput) => Promise<void>;
  onClone?: (input: AddEventInput) => Promise<void>;
  onSetKindooLicenseCreated?: (input: {
    eventId: string;
    kindooLicenseCreated: boolean;
  }) => Promise<void>;
  selectedIds?: string[];
  onSelectionChange?: (eventIds: string[]) => void;
}

export type SortKey = 'name' | 'email' | 'eventDate' | 'daysUntil';
export type SortDir = 'asc' | 'desc';
