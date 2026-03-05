'use client';

import type { EventWithCreator, UpdateEventInput, AddEventInput } from '@/actions/events';
import type { Building } from '@/schema/schema';
import type { MessageTemplateMap } from '@/lib/message-templates';
import { Button } from '@/components/_ui/button';
import { Card, CardContent } from '@/components/_ui/card';
import { EventTable } from '@/components/EventTable';

type EventsTabPanelProps = {
  events: EventWithCreator[];
  isLoading: boolean;
  isError: boolean;
  building: Building;
  messageTemplates: MessageTemplateMap;
  selectedIds: string[];
  onSelectionChangeAction: (nextIds: string[]) => void;
  onDeleteAction: (eventId: string) => Promise<void>;
  onEditAction: (input: UpdateEventInput) => Promise<void>;
  onCloneAction: (input: AddEventInput) => Promise<void>;
  onSetKindooLicenseCreatedAction: (input: {
    eventId: string;
    kindooLicenseCreated: boolean;
  }) => Promise<void>;
  licenseLeadDays: number;
  bulkDeletePending: boolean;
  onOpenBulkDeleteAction: () => void;
};

export function EventsTabPanel({
  events,
  isLoading,
  isError,
  building,
  messageTemplates,
  selectedIds,
  onSelectionChangeAction,
  onDeleteAction,
  onEditAction,
  onCloneAction,
  onSetKindooLicenseCreatedAction,
  licenseLeadDays,
  bulkDeletePending,
  onOpenBulkDeleteAction,
}: EventsTabPanelProps) {
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
            messageTemplates={messageTemplates}
            onDelete={onDeleteAction}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChangeAction}
            onEdit={onEditAction}
            onClone={onCloneAction}
            onSetKindooLicenseCreated={onSetKindooLicenseCreatedAction}
            licenseLeadDays={licenseLeadDays}
          />
        </CardContent>
      </Card>
    </div>
  );
}
