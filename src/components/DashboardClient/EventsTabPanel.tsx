'use client';

import type { AddEventInput, EventWithCreator, UpdateEventInput } from '@/actions/events';
import { Button } from '@/components/_ui/button';
import { Card, CardContent } from '@/components/_ui/card';
import { EventTable } from '@/components/EventTable';
import type { MessageTemplateMap } from '@/lib/message-templates';
import type { Building } from '@/schema/schema';

type EventsTabPanelProps = {
  events: EventWithCreator[];
  isLoading: boolean;
  isError: boolean;
  building: Building;
  messageTemplates: MessageTemplateMap;
  searchQuery?: string;
  selectedIds: string[];
  onSelectionChangeAction: (nextIds: string[]) => void;
  onDeleteAction: (eventId: string) => Promise<void>;
  onEditAction: (input: UpdateEventInput) => Promise<void>;
  onCloneAction: (input: AddEventInput) => Promise<void>;
  onSetKindooLicenseCreatedAction: (input: {
    eventId: string;
    kindooLicenseCreated: boolean;
  }) => Promise<void>;
  bulkDeletePending: boolean;
  onOpenBulkDeleteAction: () => void;
};

export function EventsTabPanel({
  events,
  isLoading,
  isError,
  building,
  messageTemplates,
  searchQuery,
  selectedIds,
  onSelectionChangeAction,
  onDeleteAction,
  onEditAction,
  onCloneAction,
  onSetKindooLicenseCreatedAction,
  bulkDeletePending,
  onOpenBulkDeleteAction,
}: EventsTabPanelProps) {
  const normalizedSearch = searchQuery?.trim() ?? '';
  const isSearching = normalizedSearch.length > 0;

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 && (
        <div className="flex w-full items-center justify-end">
          <Button
            variant="destructive"
            size="sm"
            disabled={bulkDeletePending}
            onClick={onOpenBulkDeleteAction}
          >
            Delete selected ({selectedIds.length})
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <EventTable
            events={events}
            isLoading={isLoading}
            isError={isError}
            building={building}
            emptyStateTitle={isSearching ? 'No matching events' : undefined}
            emptyStateMessage={
              isSearching ? 'Try a different search or clear the filter.' : undefined
            }
            messageTemplates={messageTemplates}
            onDelete={onDeleteAction}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChangeAction}
            onEdit={onEditAction}
            onClone={onCloneAction}
            onSetKindooLicenseCreated={onSetKindooLicenseCreatedAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
