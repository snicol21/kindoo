import { auth } from '@/lib/auth';
import { isAdminEmail, getAdminEmails } from '@/lib/admin';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';
import { adminDeleteUser, adminSetUserPassword, createUser, listUsers } from '@/actions/auth';

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

  if (!email || !isAdminEmail(email)) {
    redirect('/auth/signin');
  }

  const usersResult = await listUsers();
  const managedUsers = usersResult.success ? (usersResult.data ?? []) : [];

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
              Admins: {getAdminEmails().join(', ') || 'None'}
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <form
              action={async (formData: FormData) => {
                'use server';
                const result = await createUser({
                  email: String(formData.get('email') ?? ''),
                  name: String(formData.get('name') ?? ''),
                  password: String(formData.get('password') ?? ''),
                });
                if (!result.success) {
                  const msg = encodeURIComponent(result.error ?? 'Failed to create user.');
                  const emailValue = encodeURIComponent(String(formData.get('email') ?? ''));
                  const nameValue = encodeURIComponent(String(formData.get('name') ?? ''));
                  redirect(`/admin/users?error=${msg}&email=${emailValue}&name=${nameValue}`);
                }
                redirect('/admin/users?created=1');
              }}
              className="space-y-3"
            >
              <h3 className="text-sm font-medium">Create user</h3>
              <Input
                name="email"
                type="email"
                placeholder="user@example.com"
                defaultValue={params.email ?? ''}
              />
              <Input
                name="name"
                type="text"
                placeholder="Name (optional)"
                defaultValue={params.name ?? ''}
              />
              <Input name="password" type="password" placeholder="Temporary password" />
              <Button type="submit" className="w-full">
                Create
              </Button>
            </form>

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
              className="space-y-3"
            >
              <h3 className="text-sm font-medium">Set user password</h3>
              <input type="hidden" name="setUserEmail" value={params.setUserEmail ?? ''} />
              <select
                name="setUserId"
                defaultValue={params.setUserId ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select user…</option>
                {managedUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
              <Input name="password" type="password" placeholder="New password" />
              <Input name="confirmPassword" type="password" placeholder="Confirm password" />
              <Button type="submit" variant="secondary" className="w-full">
                Set password
              </Button>
            </form>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Delete user</h3>
            <div className="space-y-2">
              {managedUsers.map((user) => (
                <form
                  key={user.id}
                  action={async (formData: FormData) => {
                    'use server';
                    const result = await adminDeleteUser({
                      userId: String(formData.get('userId') ?? ''),
                    });
                    if (!result.success) {
                      const msg = encodeURIComponent(result.error ?? 'Failed to delete user.');
                      redirect(`/admin/users?error=${msg}`);
                    }
                    redirect('/admin/users?deleted=1');
                  }}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{user.email}</p>
                    {user.name && (
                      <p className="truncate text-xs text-muted-foreground">{user.name}</p>
                    )}
                  </div>
                  <input type="hidden" name="userId" value={user.id} />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              ))}
              {managedUsers.length === 0 && (
                <p className="text-sm text-muted-foreground">No users found.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
