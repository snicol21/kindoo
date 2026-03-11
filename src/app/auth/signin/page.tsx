import { auth, signIn } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Button } from '@/components/_ui/button';
import { Input } from '@/components/_ui/input';
import { PasswordInput } from '@/components/_ui/password-input';
import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Sign In',
};

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  await connection();
  const session = await auth();
  const params = await searchParams;

  if (session?.user?.id) {
    redirect(params.callbackUrl ?? '/dashboard');
  }

  const errorMessages: Record<string, string> = {
    OAuthSignin: 'Error starting OAuth sign in.',
    OAuthCallback: 'Error during OAuth callback.',
    OAuthCreateAccount: 'Could not create OAuth account.',
    EmailCreateAccount: 'Could not create email account.',
    Callback: 'Error in callback.',
    OAuthAccountNotLinked: 'This email is already linked to another provider.',
    CredentialsSignin: 'Invalid email or password.',
    default: 'An authentication error occurred.',
  };

  const errorMessage = params.error ? (errorMessages[params.error] ?? errorMessages.default) : null;

  return (
    <div className="flex min-h-[calc(100vh-4rem)] justify-center px-4 pt-[10vh]">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-3">
            <CalendarDays className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold">Event Tracker</h1>
            <p className="text-sm text-muted-foreground">Sign in to access your event dashboard</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Sign in with your email and password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error display */}
            {errorMessage && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            {/* ── Primary credentials login ── */}
            <form
              action={async (formData: FormData) => {
                'use server';
                try {
                  await signIn('credentials', {
                    email: formData.get('email'),
                    password: formData.get('password'),
                    redirectTo: params.callbackUrl ?? '/dashboard',
                  });
                } catch {
                  const callbackUrl = encodeURIComponent(params.callbackUrl ?? '/dashboard');
                  redirect(`/auth/signin?error=CredentialsSignin&callbackUrl=${callbackUrl}`);
                }
              }}
              className="space-y-3"
            >
              <Input name="email" type="email" placeholder="you@example.com" />
              <PasswordInput name="password" placeholder="••••••••" />
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              This is a private application.
              <wbr /> Access is restricted to authorized users only.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
