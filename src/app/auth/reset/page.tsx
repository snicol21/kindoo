import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Metadata } from 'next';
import { requestPasswordReset } from '@/actions/auth';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Reset Password',
};

interface ResetPageProps {
  searchParams: Promise<{ sent?: string }>;
}

export default async function ResetPage({ searchParams }: ResetPageProps) {
  const params = await searchParams;
  const sent = params.sent === '1';

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>Enter your email and we will send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              If that email exists, a reset link has been sent.
            </div>
          )}
          <form
            action={async (formData: FormData) => {
              'use server';
              await requestPasswordReset({
                email: String(formData.get('email') ?? ''),
              });
              redirect('/auth/reset?sent=1');
            }}
            className="space-y-3"
          >
            <Input name="email" type="email" placeholder="you@example.com" />
            <Button type="submit" className="w-full">
              Send reset link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
