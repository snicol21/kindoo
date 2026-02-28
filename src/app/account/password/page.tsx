import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { changePassword } from '@/actions/auth';

export const metadata: Metadata = {
  title: 'Change Password',
};

interface AccountPasswordPageProps {
  searchParams: Promise<{ updated?: string; error?: string }>;
}

export default async function AccountPasswordPage({ searchParams }: AccountPasswordPageProps) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  const message = params.error
    ? decodeURIComponent(params.error)
    : params.updated === '1'
      ? 'Password updated.'
      : null;

  return (
    <div className="container mx-auto max-w-md px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your password for this account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">{message}</div>
          )}
          <form
            action={async (formData: FormData) => {
              'use server';
              const result = await changePassword({
                currentPassword: String(formData.get('currentPassword') ?? ''),
                newPassword: String(formData.get('newPassword') ?? ''),
                confirmPassword: String(formData.get('confirmPassword') ?? ''),
              });

              if (!result.success) {
                const msg = encodeURIComponent(result.error ?? 'Failed to update password.');
                redirect(`/account/password?error=${msg}`);
              }

              redirect('/account/password?updated=1');
            }}
            className="space-y-3"
          >
            <Input name="currentPassword" type="password" placeholder="Current password" />
            <Input name="newPassword" type="password" placeholder="New password" />
            <Input name="confirmPassword" type="password" placeholder="Confirm new password" />
            <Button type="submit" className="w-full">
              Save password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
