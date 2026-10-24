import type { AddEventInput, EventWithCreator, UpdateEventInput } from '@/actions/events';
import type { MessageTemplateMap } from '@/lib/message-templates';

export interface EventTableProps {
  events: EventWithCreator[];
  isLoading: boolean;
  isError: boolean;
  building: string;
  defaultSortDir?: SortDir;
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
  /** Show the stake-level-only "Other" ward in edit and clone. */
  canSelectOtherWard?: boolean;
  /** Admin only. Shows Mark as handled manually and Reopen. The server enforces it too. */
  canMarkHandledManually?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (eventIds: string[]) => void;
}

export type SortKey = 'name' | 'email' | 'eventDate' | 'daysUntil';
export type SortDir = 'asc' | 'desc';
