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
import { USER_ROLES, type UserRole } from '@/schema/schema';

type CreateUserDialogProps = {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  createEmail: string;
  createName: string;
  createPassword: string;
  createRole: UserRole;
  createPending: boolean;
  onCreateEmailAction: (value: string) => void;
  onCreateNameAction: (value: string) => void;
  onCreatePasswordAction: (value: string) => void;
  onCreateRoleAction: (value: UserRole) => void;
  onSubmitAction: () => void;
};

export function CreateUserDialog({
  open,
  onOpenChangeAction,
  createEmail,
  createName,
  createPassword,
  createRole,
  createPending,
  onCreateEmailAction,
  onCreateNameAction,
  onCreatePasswordAction,
  onCreateRoleAction,
  onSubmitAction,
}: CreateUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>Add a new account with a temporary password.</DialogDescription>
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
            <Label htmlFor="create-password">Temporary password</Label>
            <PasswordInput
              id="create-password"
              value={createPassword}
              onChange={(event) => onCreatePasswordAction(event.target.value)}
            />
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Minimum 12 characters</span>
              <span>{createPassword.length}/12</span>
            </div>
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
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmitAction} disabled={createPending}>
            {createPending ? 'Creating...' : 'Create user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
