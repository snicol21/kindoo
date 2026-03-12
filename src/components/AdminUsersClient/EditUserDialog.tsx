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
  pending: boolean;
  sendCredentialsPending: boolean;
  canEditAccountDetails: boolean;
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
  onSendCredentialsAction: () => void;
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
  pending,
  sendCredentialsPending,
  canEditAccountDetails,
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
  onSendCredentialsAction,
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
              disabled={!canEditAccountDetails}
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
              disabled={!canEditAccountDetails}
              onChange={(event) => onEditEmailAction(event.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-user-phone">Phone</Label>
            <PhoneInput
              id="edit-user-phone"
              value={editPhone}
              required
              disabled={!canEditAccountDetails}
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

          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <p className="text-sm font-medium">Credentials email</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Automatically generate a temporary password and email it to the user.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={onSendCredentialsAction}
                disabled={sendCredentialsPending || !editUser || !canEditAccountDetails}
                isLoading={sendCredentialsPending}
                loadingText="Sending credentials..."
              >
                Send new credentials email
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmitAction}
            disabled={pending || !editUser}
            isLoading={pending}
            loadingText="Saving..."
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
