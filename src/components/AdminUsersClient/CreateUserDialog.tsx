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
import { PhoneInput } from '@/components/PhoneInput';
import { ROLE_LABELS } from '@/lib/permissions';
import type { UserRole, Ward } from '@/schema/schema';

type CreateUserDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  createEmail: string;
  createName: string;
  createRole: UserRole;
  createWard: Ward;
  createPhone: string;
  sendCredentialsEmail: boolean;
  wardOptions: readonly Ward[];
  allowedRoles: UserRole[];
  fixedWard?: Ward;
  createPending: boolean;
  onCreateEmailAction: (value: string) => void;
  onCreateNameAction: (value: string) => void;
  onCreateRoleAction: (value: UserRole) => void;
  onCreateWardAction: (value: Ward) => void;
  onCreatePhoneAction: (value: string) => void;
  onSendCredentialsEmailAction: (value: boolean) => void;
  onSubmitAction: () => void;
};

export function CreateUserDialog({
  open,
  onOpenChangeAction,
  createEmail,
  createName,
  createRole,
  createWard,
  createPhone,
  sendCredentialsEmail,
  wardOptions,
  allowedRoles,
  fixedWard,
  createPending,
  onCreateEmailAction,
  onCreateNameAction,
  onCreateRoleAction,
  onCreateWardAction,
  onCreatePhoneAction,
  onSendCredentialsEmailAction,
  onSubmitAction,
}: CreateUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Add a new account. A temporary password will be generated automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="create-email">Email</Label>
            <Input
              id="create-email"
              type="email"
              placeholder="user@example.com"
              value={createEmail}
              onChange={(event) => onCreateEmailAction(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="create-name">Name (optional)</Label>
            <Input
              id="create-name"
              type="text"
              placeholder="Name"
              value={createName}
              onChange={(event) => onCreateNameAction(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="create-phone">Phone</Label>
            <PhoneInput
              id="create-phone"
              placeholder="(555) 000-0000"
              required
              value={createPhone}
              onValueChange={onCreatePhoneAction}
            />
          </div>
          <div>
            <Label htmlFor="create-ward">Ward</Label>
            <Select
              value={createWard}
              onValueChange={(value) => {
                if (fixedWard) return;
                onCreateWardAction(value as Ward);
              }}
            >
              <SelectTrigger id="create-ward" disabled={!!fixedWard}>
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
            {fixedWard && (
              <p className="mt-1 text-xs text-muted-foreground">
                Ward is assigned from your account.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="create-role">Role</Label>
            <Select
              value={createRole}
              onValueChange={(value) => onCreateRoleAction(value as UserRole)}
            >
              <SelectTrigger id="create-role">
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={sendCredentialsEmail}
              onChange={(event) => onSendCredentialsEmailAction(event.target.checked)}
            />
            Send temporary credentials by email
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmitAction}
            disabled={createPending}
            isLoading={createPending}
            loadingText="Creating..."
          >
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
