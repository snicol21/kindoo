'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PasswordInput } from '@/components/ui/password-input';
import {
  adminDeleteUser,
  adminSetUserPassword,
  adminSetUserRole,
  createUser,
} from '@/actions/auth';
import { USER_ROLES, type UserRole } from '@/schema/schema';
import { KeyRound, Mail, Plus, Shield, Trash2 } from 'lucide-react';

type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
};

interface AdminUsersClientProps {
  users: ManagedUser[];
  currentUserId: string;
}

export function AdminUsersClient({ users, currentUserId }: AdminUsersClientProps) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  const filteredUsers = useMemo(
    () => (roleFilter === 'all' ? users : users.filter((user) => user.role === roleFilter)),
    [roleFilter, users]
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('user');

  const [roleOpen, setRoleOpen] = useState(false);
  const [rolePending, setRolePending] = useState(false);
  const [roleUser, setRoleUser] = useState<ManagedUser | null>(null);
  const [nextRole, setNextRole] = useState<UserRole>('user');

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);

  const resetCreateForm = () => {
    setCreateEmail('');
    setCreateName('');
    setCreatePassword('');
    setCreateRole('user');
  };

  const openRoleDialog = (user: ManagedUser) => {
    setRoleUser(user);
    setNextRole(user.role);
    setRoleOpen(true);
  };

  const openPasswordDialog = (user: ManagedUser) => {
    setPasswordUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordOpen(true);
  };

  const openDeleteDialog = (user: ManagedUser) => {
    setDeleteUser(user);
    setDeleteOpen(true);
  };

  const handleCreateUser = async () => {
    setCreatePending(true);
    try {
      const result = await createUser({
        email: createEmail,
        name: createName,
        password: createPassword,
        role: createRole,
      });

      if (!result.success) {
        toast.error(result.error ?? 'Failed to create user.');
        return;
      }

      toast.success('User created.');
      setCreateOpen(false);
      resetCreateForm();
      router.refresh();
    } finally {
      setCreatePending(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!roleUser) return;

    setRolePending(true);
    try {
      const result = await adminSetUserRole({ userId: roleUser.id, role: nextRole });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to update role.');
        return;
      }

      toast.success('Role updated.');
      setRoleOpen(false);
      router.refresh();
    } finally {
      setRolePending(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordUser) return;

    setPasswordPending(true);
    try {
      const result = await adminSetUserPassword({
        userId: passwordUser.id,
        password: newPassword,
        confirmPassword,
      });

      if (!result.success) {
        toast.error(result.error ?? 'Failed to update password.');
        return;
      }

      toast.success('Password updated.');
      setPasswordOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setPasswordPending(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;

    setDeletePending(true);
    try {
      const result = await adminDeleteUser({ userId: deleteUser.id });
      if (!result.success) {
        toast.error(result.error ?? 'Failed to delete user.');
        return;
      }

      toast.success('User deleted.');
      setDeleteOpen(false);
      router.refresh();
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>Manage roles, passwords, and access.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select
              value={roleFilter}
              onValueChange={(value) => setRoleFilter(value as 'all' | UserRole)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {USER_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create User
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="overflow-x-auto rounded-t-md rounded-b-none border-b">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-80">User</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="align-top">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold">
                              {user.name?.trim() || 'No name set'}
                            </span>
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                              {user.role}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{user.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {user.id === currentUserId ? (
                          <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            You
                          </span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Change role for ${user.email}`}
                              onClick={() => openRoleDialog(user)}
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Change password for ${user.email}`}
                              onClick={() => openPasswordDialog(user)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Delete ${user.email}`}
                              onClick={() => openDeleteDialog(user)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
                onChange={(event) => setCreateEmail(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="create-name">Name (optional)</Label>
              <Input
                id="create-name"
                type="text"
                placeholder="Name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="create-password">Temporary password</Label>
              <PasswordInput
                id="create-password"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
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
                onValueChange={(value) => setCreateRole(value as UserRole)}
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
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser} disabled={createPending}>
              {createPending ? 'Creating...' : 'Create user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              Update role for <span className="font-medium">{roleUser?.email ?? 'user'}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="role-select">Role</Label>
            <Select value={nextRole} onValueChange={(value) => setNextRole(value as UserRole)}>
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
            <Button variant="outline" onClick={() => setRoleOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateRole}
              disabled={rolePending || !roleUser || nextRole === roleUser.role}
            >
              {rolePending ? 'Saving...' : 'Save role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
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
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm password</Label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePassword} disabled={passwordPending || !passwordUser}>
              {passwordPending ? 'Saving...' : 'Update password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={deletePending || !deleteUser}
            >
              {deletePending ? 'Deleting...' : 'Delete user'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
