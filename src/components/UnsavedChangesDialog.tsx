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

type UnsavedChangesDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UnsavedChangesDialog({ open, onCancel, onConfirm }: UnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>Are you sure you want to discard these changes?</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Discard changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
