'use client';

import {
  adminDeleteUser,
  adminSendUserCredentials,
  adminSetUserEmail,
  adminSetUserName,
  adminSetUserPhone,
  adminSetUserRole,
  adminSetUserWard,
  createUser,
} from '@/actions/auth';
import { Card, CardContent } from '@/components/_ui/card';
import { AccessRequestsTable } from '@/components/AdminUsersClient/AccessRequestsTable';
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
  accessRequests = [],
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
  const [createRole, setCreateRole] = useState<UserRole>('ward_user');
  const [createWard, setCreateWard] = useState<Ward>(currentUserWard as Ward);
  const [createPhone, setCreatePhone] = useState('');
  const [sendCredentialsEmail, setSendCredentialsEmail] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editPending, setEditPending] = useState(false);
  const [sendCredentialsPending, setSendCredentialsPending] = useState(false);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('ward_user');
  const [editWard, setEditWard] = useState<Ward>(currentUserWard as Ward);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null);

  const resetCreateForm = () => {
    setCreateEmail('');
    setCreateName('');
    setCreateRole('ward_user');
    setCreateWard(currentUserWard as Ward);
    setCreatePhone('');
    setSendCredentialsEmail(true);
  };

  const canManageTargetUser = (user: ManagedUser) => {
    if (!canManageUser(currentUserRole, user.role)) return false;
    if (currentUserRole === 'ward_manager') {
      return user.ward === currentUserWard;
    }
    return true;
  };

  const canSelfChangeWard = (user: ManagedUser) =>
    user.id === currentUserId &&
    (currentUserRole === 'admin' || currentUserRole === 'stake_manager');

  const openEditDialog = (user: ManagedUser) => {
    if (!canManageTargetUser(user) && !canSelfChangeWard(user)) {
      toast.error('You cannot change this user.');
      return;
    }
    setEditUser(user);
    setEditEmail(user.email);
    setEditPhone(user.phone);
    setEditName(user.name ?? '');
    setEditRole(user.role);
    setEditWard(user.ward);
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
      (['ward_user', 'ward_manager', 'stake_manager', 'admin'] as UserRole[]).filter((role) =>
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
    if (!editUser) return false;
    if (canSelfChangeWard(editUser)) return true;
    if (!canManageTargetUser(editUser)) return false;
    return currentUserRole !== 'ward_manager';
  }, [editUser, currentUserRole, currentUserWard, currentUserId]);

  const handleCreateUser = async () => {
    setCreatePending(true);
    try {
      const result = await createUser({
        email: createEmail,
        name: createName,
        role: createRole,
        ward: createWard,
        phone: createPhone,
        sendCredentialsEmail,
      });

      if (!result.success) {
        toast.error(result.error ?? 'Failed to create user.');
        return;
      }

      if (result.data?.emailWarning) {
        toast.warning(result.data.emailWarning);
      } else {
        toast.success('User created and credentials email sent.');
      }
      setCreateOpen(false);
      resetCreateForm();
      router.refresh();
    } catch {
      toast.error('Unexpected server error while creating user. Please try again.');
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

      if (!changedEmail && !changedPhone && !changedName && !changedRole && !changedWard) {
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

      toast.success('User updated.');
      setEditOpen(false);
      router.refresh();
    } catch {
      toast.error('Unexpected server error while updating user. Please try again.');
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
    } catch {
      toast.error('Unexpected server error while deleting user. Please try again.');
    } finally {
      setDeletePending(false);
    }
  };

  const handleSendEditUserCredentials = async () => {
    if (!editUser) return;

    setSendCredentialsPending(true);
    try {
      const result = await adminSendUserCredentials({ userId: editUser.id });

      if (!result.success) {
        toast.error(result.error ?? 'Failed to send credentials email.');
        return;
      }

      if (result.data?.emailWarning) {
        toast.warning(result.data.emailWarning);
      } else {
        toast.success('New credentials email sent.');
      }

      setEditOpen(false);
      router.refresh();
    } catch {
      toast.error('Unexpected server error while sending credentials. Please try again.');
    } finally {
      setSendCredentialsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Access requests</h2>
            <p className="text-sm text-muted-foreground">
              Review and approve incoming requests before account creation.
            </p>
          </div>
          <AccessRequestsTable requests={accessRequests} currentUserRole={currentUserRole} />
        </CardContent>
      </Card>

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
        createRole={createRole}
        createWard={createWard}
        createPhone={createPhone}
        sendCredentialsEmail={sendCredentialsEmail}
        wardOptions={WARDS}
        allowedRoles={assignableRoles}
        fixedWard={currentUserRole === 'ward_manager' ? (currentUserWard as Ward) : undefined}
        createPending={createPending}
        onCreateEmailAction={setCreateEmail}
        onCreateNameAction={setCreateName}
        onCreateRoleAction={setCreateRole}
        onCreateWardAction={setCreateWard}
        onCreatePhoneAction={setCreatePhone}
        onSendCredentialsEmailAction={setSendCredentialsEmail}
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
        pending={editPending}
        sendCredentialsPending={sendCredentialsPending}
        canEditAccountDetails={!!editUser && canManageTargetUser(editUser)}
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
        onSendCredentialsAction={handleSendEditUserCredentials}
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
