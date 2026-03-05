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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { USER_ROLES, type UserRole } from '@/schema/schema';
import type { ManagedUser } from '@/components/AdminUsersClient/types';

type RoleDialogProps = {
  open: boolean;
  roleUser: ManagedUser | null;
  nextRole: UserRole;
  rolePending: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onNextRoleAction: (value: UserRole) => void;
  onSubmitAction: () => void;
};

export function RoleDialog({
  open,
  roleUser,
  nextRole,
  rolePending,
  onOpenChangeAction,
  onNextRoleAction,
  onSubmitAction,
}: RoleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update role for <span className="font-medium">{roleUser?.email ?? 'user'}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="role-select">Role</Label>
          <Select value={nextRole} onValueChange={(value) => onNextRoleAction(value as UserRole)}>
            <SelectTrigger id="role-select">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChangeAction(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmitAction}
            disabled={rolePending || !roleUser || nextRole === roleUser.role}
          >
            {rolePending ? 'Saving...' : 'Save role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
