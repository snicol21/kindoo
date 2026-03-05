import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { PasswordInputWithCount } from '@/components/PasswordInputWithCount';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Metadata } from 'next';
import {
  adminDeleteUser,
  adminSetUserPassword,
  adminSetUserRole,
  createUser,
  listUsers,
} from '@/actions/auth';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { USER_ROLES, type UserRole } from '@/schema/schema';
import { AdminUserRoleForm } from '@/components/AdminUserRoleForm';
import { ClearSuccessParams } from '@/components/ClearSuccessParams';

export const metadata: Metadata = {
  title: 'User Admin',
};

interface AdminUsersPageProps {
  searchParams: Promise<{
    created?: string;
    updated?: string;
    deleted?: string;
    error?: string;
    email?: string;
    name?: string;
    setUserId?: string;
    setUserEmail?: string;
  }>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const params = await searchParams;
  const currentUserId = session?.user?.id ?? null;

  const isAdmin = session?.user?.role === 'admin' || isAdminEmail(email);
  if (!email || !isAdmin) {
    redirect('/auth/signin');
  }

  const usersResult = await listUsers();
  const managedUsers = usersResult.success ? (usersResult.data ?? []) : [];
  const adminUsers = managedUsers.filter((user) => user.role === 'admin');

  const message = params.error
    ? decodeURIComponent(params.error)
    : params.created === '1'
      ? 'User created.'
      : params.updated === '1'
        ? 'Password updated.'
        : params.deleted === '1'
          ? 'User deleted.'
          : null;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <ClearSuccessParams keys={['created', 'updated', 'deleted']} />
      <div className="sticky top-2 z-10 w-fit rounded-md bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 sm:static sm:bg-transparent sm:backdrop-blur-none">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>User Admin</CardTitle>
          <CardDescription>Manage who can access the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {message && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">{message}</div>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Admins: {adminUsers.map((user) => user.email).join(', ') || 'None'}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Create user</h3>
                <p className="text-xs text-muted-foreground">
                  Add a new account with a temporary password.
                </p>
              </div>
              <form
                action={async (formData: FormData) => {
                  'use server';
                  const result = await createUser({
                    email: String(formData.get('email') ?? ''),
                    name: String(formData.get('name') ?? ''),
                    password: String(formData.get('password') ?? ''),
                    role: String(formData.get('role') ?? 'user') as UserRole,
                  });
                  if (!result.success) {
                    const msg = encodeURIComponent(result.error ?? 'Failed to create user.');
                    const emailValue = encodeURIComponent(String(formData.get('email') ?? ''));
                    const nameValue = encodeURIComponent(String(formData.get('name') ?? ''));
                    redirect(`/admin/users?error=${msg}&email=${emailValue}&name=${nameValue}`);
                  }
                  redirect('/admin/users?created=1');
                }}
                className="mt-4 space-y-3"
              >
                <div>
                  <Label htmlFor="create-email">Email</Label>
                  <Input
                    id="create-email"
                    name="email"
                    type="email"
                    placeholder="user@example.com"
                    defaultValue={params.email ?? ''}
                  />
                </div>
                <div>
                  <Label htmlFor="create-name">Name (optional)</Label>
                  <Input
                    id="create-name"
                    name="name"
                    type="text"
                    placeholder="Name"
                    defaultValue={params.name ?? ''}
                  />
                </div>
                <div>
                  <Label htmlFor="create-password">Temporary password</Label>
                  <PasswordInputWithCount id="create-password" name="password" minLength={12} />
                </div>
                <div>
                  <Label htmlFor="create-role">Role</Label>
                  <Select name="role" defaultValue="user">
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
                <Button type="submit" className="w-full">
                  Create user
                </Button>
              </form>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Set user password</h3>
                <p className="text-xs text-muted-foreground">
                  Reset a user password if they cannot sign in.
                </p>
              </div>
              <form
                action={async (formData: FormData) => {
                  'use server';
                  const result = await adminSetUserPassword({
                    userId: String(formData.get('setUserId') ?? ''),
                    password: String(formData.get('password') ?? ''),
                    confirmPassword: String(formData.get('confirmPassword') ?? ''),
                  });
                  if (!result.success) {
                    const msg = encodeURIComponent(result.error ?? 'Failed to update password.');
                    const setUserId = encodeURIComponent(String(formData.get('setUserId') ?? ''));
                    const setUserEmail = encodeURIComponent(
                      String(formData.get('setUserEmail') ?? '')
                    );
                    redirect(
                      `/admin/users?error=${msg}&setUserId=${setUserId}&setUserEmail=${setUserEmail}`
                    );
                  }
                  redirect('/admin/users?updated=1');
                }}
                className="mt-4 space-y-3"
              >
                <input type="hidden" name="setUserEmail" value={params.setUserEmail ?? ''} />
                <div>
                  <Label htmlFor="setUserId">Select user</Label>
                  <Select name="setUserId" defaultValue={params.setUserId ?? ''}>
                    <SelectTrigger id="setUserId">
                      <SelectValue placeholder="Select user…" />
                    </SelectTrigger>
                    <SelectContent>
                      {managedUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="set-password">New password</Label>
                  <PasswordInput id="set-password" name="password" />
                </div>
                <div>
                  <Label htmlFor="set-confirm-password">Confirm password</Label>
                  <PasswordInput id="set-confirm-password" name="confirmPassword" />
                </div>
                <Button type="submit" className="w-full">
                  Update password
                </Button>
              </form>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete user</CardTitle>
          <CardDescription>Remove an account from the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {managedUsers.map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.email}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {user.name && <span className="truncate">{user.name}</span>}
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {user.role}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {currentUserId !== user.id && (
                    <>
                      <AdminUserRoleForm
                        userId={user.id}
                        initialRole={user.role}
                        roles={USER_ROLES}
                        action={async (formData: FormData) => {
                          'use server';
                          const result = await adminSetUserRole({
                            userId: String(formData.get('userId') ?? ''),
                            role: String(formData.get('role') ?? 'user') as UserRole,
                          });
                          if (!result.success) {
                            const msg = encodeURIComponent(
                              result.error ?? 'Failed to update role.'
                            );
                            redirect(`/admin/users?error=${msg}`);
                          }
                          redirect('/admin/users?updated=1');
                        }}
                      />
                      <form
                        action={async (formData: FormData) => {
                          'use server';
                          const result = await adminDeleteUser({
                            userId: String(formData.get('userId') ?? ''),
                          });
                          if (!result.success) {
                            const msg = encodeURIComponent(
                              result.error ?? 'Failed to delete user.'
                            );
                            redirect(`/admin/users?error=${msg}`);
                          }
                          redirect('/admin/users?deleted=1');
                        }}
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <Button type="submit" variant="destructive" size="sm">
                          Delete
                        </Button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            ))}
            {managedUsers.length === 0 && (
              <p className="text-sm text-muted-foreground">No users found.</p>
            )}
          </div>
        </CardContent>
      </Card>
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
