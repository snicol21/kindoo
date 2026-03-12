import { completeForcedPasswordReset } from '@/actions/auth';
import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Label } from '@/components/_ui/label';
import { PasswordInput } from '@/components/_ui/password-input';
import { FormSubmitButton } from '@/components/FormSubmitButton';
import { PageContainer } from '@/components/PageContainer';
import { PasswordInputWithCount } from '@/components/PasswordInputWithCount';
import { auth, signOut } from '@/lib/auth';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Change temporary password',
};

const PASSWORD_MIN_LENGTH = 12;

interface ForcedPasswordPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function ForcedPasswordPage({ searchParams }: ForcedPasswordPageProps) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  if (!session.user.mustChangePassword) {
    redirect('/dashboard');
  }

  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  return (
    <PageContainer width="narrow" className="pt-12">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="rounded-md border border-blue-400 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
          You must change your temporary password before continuing.
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              For security, choose a new password to finish signing in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData: FormData) => {
                'use server';
                const result = await completeForcedPasswordReset({
                  newPassword: String(formData.get('newPassword') ?? ''),
                  confirmPassword: String(formData.get('confirmPassword') ?? ''),
                });

                if (!result.success) {
                  const msg = encodeURIComponent(result.error ?? 'Failed to update password.');
                  redirect(`/change-password?error=${msg}`);
                }

                redirect('/dashboard');
              }}
              className="space-y-4"
            >
              {errorMessage && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="newPassword">New password</Label>
                <PasswordInputWithCount
                  id="newPassword"
                  name="newPassword"
                  minLength={PASSWORD_MIN_LENGTH}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  minLength={PASSWORD_MIN_LENGTH}
                  required
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit">Update password</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <FormSubmitButton variant="ghost" size="sm" loadingText="Signing out...">
              Sign out and return home
            </FormSubmitButton>
          </form>
        </div>
      </div>
    </PageContainer>
  );
}
