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
import type { ManagedUser } from '@/components/AdminUsersClient/types';

type DeleteUserDialogProps = {
  open: boolean;
  deleteUser: ManagedUser | null;
  deletePending: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onConfirmAction: () => void;
};

export function DeleteUserDialog({
  open,
  deleteUser,
  deletePending,
  onOpenChangeAction,
  onConfirmAction,
}: DeleteUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user?</DialogTitle>
          <DialogDescription>
            This will permanently delete{' '}
            <span className="font-medium">{deleteUser?.email ?? 'this user'}</span> and all events
            created by this user. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirmAction} disabled={deletePending}>
            {deletePending ? 'Deleting...' : 'Delete user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
