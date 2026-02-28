import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Metadata } from 'next';
import { resetPassword } from '@/actions/auth';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Set New Password',
};

interface ResetTokenPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function ResetTokenPage({ params, searchParams }: ResetTokenPageProps) {
  const { token } = await params;
  const sp = await searchParams;
  const errorMessage = sp.error ? decodeURIComponent(sp.error) : null;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>Choose a strong password you can remember.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}
          <form
            action={async (formData: FormData) => {
              'use server';
              const result = await resetPassword({
                token,
                password: String(formData.get('password') ?? ''),
                confirmPassword: String(formData.get('confirmPassword') ?? ''),
              });
              if (!result.success) {
                const message = encodeURIComponent(result.error ?? 'Failed to reset password.');
                redirect(`/auth/reset/${token}?error=${message}`);
              }
              redirect('/auth/signin');
            }}
            className="space-y-3"
          >
            <Input name="password" type="password" placeholder="New password" />
            <Input name="confirmPassword" type="password" placeholder="Confirm password" />
            <Button type="submit" className="w-full">
              Save new password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
