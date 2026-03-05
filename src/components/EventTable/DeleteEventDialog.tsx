'use client';

import type { EventWithCreator } from '@/actions/events';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

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
              ? `This will permanently delete "${pendingDeleteEvent.name}".`
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
          >
            {pendingDeleteEvent && deletingId === pendingDeleteEvent.id ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
