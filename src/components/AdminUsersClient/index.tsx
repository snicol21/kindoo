'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/_ui/card';
import {
  adminDeleteUser,
  adminSetUserPassword,
  adminSetUserRole,
  createUser,
} from '@/actions/auth';
import type { UserRole } from '@/schema/schema';
import { AdminUsersHeader } from '@/components/AdminUsersClient/AdminUsersHeader';
import { CreateUserDialog } from '@/components/AdminUsersClient/CreateUserDialog';
import { DeleteUserDialog } from '@/components/AdminUsersClient/DeleteUserDialog';
import { PasswordDialog } from '@/components/AdminUsersClient/PasswordDialog';
import { RoleDialog } from '@/components/AdminUsersClient/RoleDialog';
import { UsersTable } from '@/components/AdminUsersClient/UsersTable';
import type { AdminUsersClientProps, ManagedUser, RoleFilter } from './types';

export function AdminUsersClient({ users, currentUserId }: AdminUsersClientProps) {
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

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
        <AdminUsersHeader
          roleFilter={roleFilter}
          onRoleFilterChangeAction={setRoleFilter}
          onCreateUserAction={() => setCreateOpen(true)}
        />
        <CardContent>
          <UsersTable
            users={filteredUsers}
            currentUserId={currentUserId}
            onOpenRoleAction={openRoleDialog}
            onOpenPasswordAction={openPasswordDialog}
            onOpenDeleteAction={openDeleteDialog}
          />
        </CardContent>
      </Card>

      <CreateUserDialog
        open={createOpen}
        onOpenChangeAction={setCreateOpen}
        createEmail={createEmail}
        createName={createName}
        createPassword={createPassword}
        createRole={createRole}
        createPending={createPending}
        onCreateEmailAction={setCreateEmail}
        onCreateNameAction={setCreateName}
        onCreatePasswordAction={setCreatePassword}
        onCreateRoleAction={setCreateRole}
        onSubmitAction={handleCreateUser}
      />

      <RoleDialog
        open={roleOpen}
        roleUser={roleUser}
        nextRole={nextRole}
        rolePending={rolePending}
        onOpenChangeAction={setRoleOpen}
        onNextRoleAction={setNextRole}
        onSubmitAction={handleUpdateRole}
      />

      <PasswordDialog
        open={passwordOpen}
        passwordUser={passwordUser}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        passwordPending={passwordPending}
        onOpenChangeAction={setPasswordOpen}
        onNewPasswordAction={setNewPassword}
        onConfirmPasswordAction={setConfirmPassword}
        onSubmitAction={handleUpdatePassword}
      />

      <DeleteUserDialog
        open={deleteOpen}
        deleteUser={deleteUser}
        deletePending={deletePending}
        onOpenChangeAction={setDeleteOpen}
        onConfirmAction={handleDeleteUser}
      />
    </div>
  );
}
