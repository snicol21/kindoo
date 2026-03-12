'use client';

import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';

type BulkDeleteDialogProps = {
  open: boolean;
  selectedCount: number;
  deleting: boolean;
  onCloseAction: () => void;
  onConfirmAction: () => Promise<void>;
};

export function BulkDeleteDialog({
  open,
  selectedCount,
  deleting,
  onCloseAction,
  onConfirmAction,
}: BulkDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCloseAction()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete selected events?</DialogTitle>
          <DialogDescription>
            This will permanently delete {selectedCount} event{selectedCount === 1 ? '' : 's'}. This
            action cannot be undone.
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
            disabled={selectedCount === 0 || deleting}
            isLoading={deleting}
            loadingText="Deleting…"
          >
            Delete selected
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
