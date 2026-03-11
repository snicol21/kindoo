'use client';

import {
  adminDeleteUser,
  adminSetUserEmail,
  adminSetUserName,
  adminSetUserPassword,
  adminSetUserPhone,
  adminSetUserRole,
  adminSetUserWard,
  createUser,
} from '@/actions/auth';
import { Card, CardContent } from '@/components/_ui/card';
import { AdminUsersHeader } from '@/components/AdminUsersClient/AdminUsersHeader';
import { CreateUserDialog } from '@/components/AdminUsersClient/CreateUserDialog';
import { DeleteUserDialog } from '@/components/AdminUsersClient/DeleteUserDialog';
import { EditUserDialog } from '@/components/AdminUsersClient/EditUserDialog';
import { UsersTable } from '@/components/AdminUsersClient/UsersTable';
import { canAssignRole, canManageUser } from '@/lib/permissions';
import type { UserRole, Ward } from '@/schema/schema';
import { WARDS } from '@/schema/schema';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { AdminUsersClientProps, ManagedUser } from './types';

const buildUserSearchHaystack = (user: ManagedUser) =>
  [user.name, user.email, user.role, user.ward, user.phone].filter(Boolean).join(' ').toLowerCase();

export function AdminUsersClient({
  users,
  currentUserId,
  currentUserRole,
  currentUserWard,
  searchQuery = '',
}: AdminUsersClientProps) {
  const router = useRouter();

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    if (!normalizedSearch) return users;
    return users.filter((user) => buildUserSearchHaystack(user).includes(normalizedSearch));
  }, [searchQuery, users]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<UserRole>('ward_user');
  const [createWard, setCreateWard] = useState<Ward>(currentUserWard as Ward);
  const [createPhone, setCreatePhone] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ward_user');
  const [editWard, setEditWard] = useState<Ward>(currentUserWard as Ward);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);

  const resetCreateForm = () => {
    setCreateEmail('');
    setCreateName('');
    setCreatePassword('');
    setCreateRole('ward_user');
    setCreateWard(currentUserWard as Ward);
    setCreatePhone('');
  };

  const canManageTargetUser = (user: ManagedUser) => {
    if (!canManageUser(currentUserRole, user.role)) return false;
    if (currentUserRole === 'ward_manager') {
      return user.ward === currentUserWard;
    }
    return true;
  };

  const openEditDialog = (user: ManagedUser) => {
    if (!canManageTargetUser(user)) {
      toast.error('You cannot change this user.');
      return;
    }
    setEditUser(user);
    setEditEmail(user.email);
    setEditPhone(user.phone);
    setEditName(user.name ?? '');
    setEditRole(user.role);
    setEditWard(user.ward);
    setNewPassword('');
    setConfirmPassword('');
    setEditOpen(true);
  };

  const openDeleteDialog = (user: ManagedUser) => {
    if (!canManageTargetUser(user)) {
      toast.error('You cannot delete this user.');
      return;
    }
    setDeleteUser(user);
    setDeleteOpen(true);
  };

  const assignableRoles = useMemo(
    () =>
      (['admin', 'stake_manager', 'ward_manager', 'ward_user'] as UserRole[]).filter((role) =>
        canAssignRole(currentUserRole, role)
      ),
    [currentUserRole]
  );

  const editAllowedRoles = useMemo(() => {
    if (!editUser || !canManageTargetUser(editUser)) return [] as UserRole[];
    return assignableRoles;
  }, [assignableRoles, editUser, currentUserRole, currentUserWard]);

  const canEditRoleField = useMemo(() => {
    if (!editUser || !canManageTargetUser(editUser)) return false;
    if (currentUserRole === 'ward_manager') return false;
    return editAllowedRoles.some((role) => role !== editUser.role);
  }, [editAllowedRoles, editUser, currentUserRole, currentUserWard]);

  const editWardOptions = useMemo(() => {
    if (currentUserRole === 'ward_manager') {
      return [currentUserWard as Ward] as const;
    }
    return WARDS;
  }, [currentUserRole, currentUserWard]);

  const canEditWardField = useMemo(() => {
    if (!editUser || !canManageTargetUser(editUser)) return false;
    return currentUserRole !== 'ward_manager';
  }, [editUser, currentUserRole, currentUserWard]);

  const handleCreateUser = async () => {
    setCreatePending(true);
    try {
      const result = await createUser({
        email: createEmail,
        name: createName,
        password: createPassword,
        role: createRole,
        ward: createWard,
        phone: createPhone,
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

  const handleSaveEditUser = async () => {
    if (!editUser) return;

    setEditPending(true);
    try {
      const changedEmail = editEmail.trim().toLowerCase() !== editUser.email.trim().toLowerCase();
      const changedPhone = editPhone.trim() !== editUser.phone.trim();
      const changedName = (editName.trim() || '') !== (editUser.name?.trim() || '');
      const changedRole = editRole !== editUser.role;
      const changedWard = editWard !== editUser.ward;
      const wantsPasswordUpdate =
        newPassword.trim().length > 0 || confirmPassword.trim().length > 0;

      if (
        !changedEmail &&
        !changedPhone &&
        !changedName &&
        !changedRole &&
        !changedWard &&
        !wantsPasswordUpdate
      ) {
        setEditOpen(false);
        return;
      }

      if (changedEmail) {
        const emailResult = await adminSetUserEmail({ userId: editUser.id, email: editEmail });
        if (!emailResult.success) {
          toast.error(emailResult.error ?? 'Failed to update email.');
          return;
        }
      }

      if (changedPhone) {
        const phoneResult = await adminSetUserPhone({ userId: editUser.id, phone: editPhone });
        if (!phoneResult.success) {
          toast.error(phoneResult.error ?? 'Failed to update phone.');
          return;
        }
      }

      if (changedName) {
        const nameResult = await adminSetUserName({ userId: editUser.id, name: editName });
        if (!nameResult.success) {
          toast.error(nameResult.error ?? 'Failed to update name.');
          return;
        }
      }

      if (changedRole) {
        const roleResult = await adminSetUserRole({ userId: editUser.id, role: editRole });
        if (!roleResult.success) {
          toast.error(roleResult.error ?? 'Failed to update role.');
          return;
        }
      }

      if (changedWard) {
        const wardResult = await adminSetUserWard({ userId: editUser.id, ward: editWard });
        if (!wardResult.success) {
          toast.error(wardResult.error ?? 'Failed to update ward.');
          return;
        }
      }

      if (wantsPasswordUpdate) {
        const passwordResult = await adminSetUserPassword({
          userId: editUser.id,
          password: newPassword,
          confirmPassword,
        });
        if (!passwordResult.success) {
          toast.error(passwordResult.error ?? 'Failed to update password.');
          return;
        }
      }

      toast.success('User updated.');
      setEditOpen(false);
      setNewPassword('');
      setConfirmPassword('');
      router.refresh();
    } finally {
      setEditPending(false);
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
        <AdminUsersHeader onCreateUserAction={() => setCreateOpen(true)} />
        <CardContent>
          <UsersTable
            users={filteredUsers}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            currentUserWard={currentUserWard}
            onOpenEditAction={openEditDialog}
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
        createWard={createWard}
        createPhone={createPhone}
        wardOptions={WARDS}
        allowedRoles={assignableRoles}
        fixedWard={currentUserRole === 'ward_manager' ? (currentUserWard as Ward) : undefined}
        createPending={createPending}
        onCreateEmailAction={setCreateEmail}
        onCreateNameAction={setCreateName}
        onCreatePasswordAction={setCreatePassword}
        onCreateRoleAction={setCreateRole}
        onCreateWardAction={setCreateWard}
        onCreatePhoneAction={setCreatePhone}
        onSubmitAction={handleCreateUser}
      />

      <EditUserDialog
        open={editOpen}
        editUser={editUser}
        editEmail={editEmail}
        editPhone={editPhone}
        editName={editName}
        editRole={editRole}
        editWard={editWard}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        pending={editPending}
        canEditNameAndPassword={!!editUser && canManageTargetUser(editUser)}
        canEditRole={canEditRoleField}
        canEditWard={canEditWardField}
        wardOptions={editWardOptions}
        allowedRoles={editAllowedRoles}
        onOpenChangeAction={setEditOpen}
        onEditEmailAction={setEditEmail}
        onEditPhoneAction={setEditPhone}
        onEditNameAction={setEditName}
        onEditRoleAction={setEditRole}
        onEditWardAction={setEditWard}
        onNewPasswordAction={setNewPassword}
        onConfirmPasswordAction={setConfirmPassword}
        onSubmitAction={handleSaveEditUser}
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
