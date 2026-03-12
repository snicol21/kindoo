'use client';

import type { EventWithCreator } from '@/actions/events';
import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';

type DeleteEventDialogProps = {
  pendingDeleteEvent: EventWithCreator | null;
  deletingId: string | null;
  onCloseAction: () => void;
  onConfirmAction: () => Promise<void>;
};

export function DeleteEventDialog({
  pendingDeleteEvent,
  deletingId,
  onCloseAction,
  onConfirmAction,
}: DeleteEventDialogProps) {
  return (
    <Dialog open={!!pendingDeleteEvent} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete event?</DialogTitle>
          <DialogDescription>
            {pendingDeleteEvent
              ? `This will permanently delete "${pendingDeleteEvent.contactName}".`
              : 'This action cannot be undone.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCloseAction}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              void onConfirmAction();
            }}
            disabled={!pendingDeleteEvent || deletingId === pendingDeleteEvent.id}
            isLoading={!!pendingDeleteEvent && deletingId === pendingDeleteEvent.id}
            loadingText="Deleting…"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
