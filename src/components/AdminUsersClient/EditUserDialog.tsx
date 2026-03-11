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
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import { PasswordInput } from '@/components/_ui/password-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import type { ManagedUser } from '@/components/AdminUsersClient/types';
import { PhoneInput } from '@/components/PhoneInput';
import { ROLE_LABELS } from '@/lib/permissions';
import type { UserRole, Ward } from '@/schema/schema';

type EditUserDialogProps = {
  open: boolean;
  editUser: ManagedUser | null;
  editEmail: string;
  editPhone: string;
  editName: string;
  editRole: UserRole;
  editWard: Ward;
  newPassword: string;
  confirmPassword: string;
  pending: boolean;
  canEditNameAndPassword: boolean;
  canEditRole: boolean;
  canEditWard: boolean;
  wardOptions: readonly Ward[];
  allowedRoles: UserRole[];
  onOpenChangeAction: (open: boolean) => void;
  onEditEmailAction: (value: string) => void;
  onEditPhoneAction: (value: string) => void;
  onEditNameAction: (value: string) => void;
  onEditRoleAction: (value: UserRole) => void;
  onEditWardAction: (value: Ward) => void;
  onNewPasswordAction: (value: string) => void;
  onConfirmPasswordAction: (value: string) => void;
  onSubmitAction: () => void;
};

export function EditUserDialog({
  open,
  editUser,
  editEmail,
  editPhone,
  editName,
  editRole,
  editWard,
  newPassword,
  confirmPassword,
  pending,
  canEditNameAndPassword,
  canEditRole,
  canEditWard,
  wardOptions,
  allowedRoles,
  onOpenChangeAction,
  onEditEmailAction,
  onEditPhoneAction,
  onEditNameAction,
  onEditRoleAction,
  onEditWardAction,
  onNewPasswordAction,
  onConfirmPasswordAction,
  onSubmitAction,
}: EditUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update details for <span className="font-medium">{editUser?.email ?? 'user'}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-4 sm:-mx-6 sm:px-6">
          <div>
            <Label htmlFor="edit-user-name">Name</Label>
            <Input
              id="edit-user-name"
              value={editName}
              placeholder="Name"
              disabled={!canEditNameAndPassword}
              onChange={(event) => onEditNameAction(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-user-email">Email</Label>
            <Input
              id="edit-user-email"
              type="email"
              value={editEmail}
              placeholder="user@example.com"
              disabled={!canEditNameAndPassword}
              onChange={(event) => onEditEmailAction(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-user-phone">Phone</Label>
            <PhoneInput
              id="edit-user-phone"
              value={editPhone}
              required
              disabled={!canEditNameAndPassword}
              onValueChange={onEditPhoneAction}
            />
          </div>

          <div>
            <Label htmlFor="edit-user-role">Role</Label>
            <Select
              value={editRole}
              onValueChange={(value) => onEditRoleAction(value as UserRole)}
              disabled={!canEditRole}
            >
              <SelectTrigger id="edit-user-role">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="edit-user-ward">Ward</Label>
            <Select
              value={editWard}
              onValueChange={(value) => onEditWardAction(value as Ward)}
              disabled={!canEditWard}
            >
              <SelectTrigger id="edit-user-ward">
                <SelectValue placeholder="Select ward" />
              </SelectTrigger>
              <SelectContent>
                {wardOptions.map((ward) => (
                  <SelectItem key={ward} value={ward}>
                    {ward}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Security
            </h3>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          <div>
            <Label htmlFor="edit-user-password">New password</Label>
            <PasswordInput
              id="edit-user-password"
              value={newPassword}
              disabled={!canEditNameAndPassword}
              onChange={(event) => onNewPasswordAction(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to keep existing password.
            </p>
          </div>

          <div>
            <Label htmlFor="edit-user-confirm-password">Confirm password</Label>
            <PasswordInput
              id="edit-user-confirm-password"
              value={confirmPassword}
              disabled={!canEditNameAndPassword || !newPassword}
              onChange={(event) => onConfirmPasswordAction(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmitAction} disabled={pending || !editUser}>
            {pending ? 'Saving...' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
