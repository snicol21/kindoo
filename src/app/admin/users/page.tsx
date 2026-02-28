import { auth } from '@/lib/auth';
import { isAdminEmail, getAdminEmails } from '@/lib/admin';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';
import { createUser, sendResetEmail } from '@/actions/auth';

export const metadata: Metadata = {
  title: 'User Admin',
};

interface AdminUsersPageProps {
  searchParams: Promise<{
    created?: string;
    reset?: string;
    error?: string;
    email?: string;
    name?: string;
    resetEmail?: string;
  }>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const params = await searchParams;

  if (!email || !isAdminEmail(email)) {
    redirect('/auth/signin');
  }

  const message = params.error
    ? decodeURIComponent(params.error)
    : params.created === '1'
      ? 'User created.'
      : params.reset === '1'
        ? 'Password reset email sent.'
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
                const result = await sendResetEmail({
                  email: String(formData.get('resetEmail') ?? ''),
                });
                if (!result.success) {
                  const msg = encodeURIComponent(result.error ?? 'Failed to send reset email.');
                  const emailValue = encodeURIComponent(String(formData.get('resetEmail') ?? ''));
                  redirect(`/admin/users?error=${msg}&resetEmail=${emailValue}`);
                }
                redirect('/admin/users?reset=1');
              }}
              className="space-y-3"
            >
              <h3 className="text-sm font-medium">Send reset link</h3>
              <Input
                name="resetEmail"
                type="email"
                placeholder="user@example.com"
                defaultValue={params.resetEmail ?? ''}
              />
              <Button type="submit" variant="secondary" className="w-full">
                Send reset
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
