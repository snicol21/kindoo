'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import type { ManagedUser } from '@/components/AdminUsersClient/types';

type PasswordDialogProps = {
  open: boolean;
  passwordUser: ManagedUser | null;
  newPassword: string;
  confirmPassword: string;
  passwordPending: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onNewPasswordAction: (value: string) => void;
  onConfirmPasswordAction: (value: string) => void;
  onSubmitAction: () => void;
};

export function PasswordDialog({
  open,
  passwordUser,
  newPassword,
  confirmPassword,
  passwordPending,
  onOpenChangeAction,
  onNewPasswordAction,
  onConfirmPasswordAction,
  onSubmitAction,
}: PasswordDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>
            Set a new password for{' '}
            <span className="font-medium">{passwordUser?.email ?? 'user'}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={(event) => onNewPasswordAction(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="confirm-password">Confirm password</Label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordAction(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmitAction} disabled={passwordPending || !passwordUser}>
            {passwordPending ? 'Saving...' : 'Update password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
