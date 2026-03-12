import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Input } from '@/components/_ui/input';
import { PasswordInput } from '@/components/_ui/password-input';
import { auth, signIn } from '@/lib/auth';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Sign in',
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
          <div className="rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/15">
            <Image src="/icons/favicon.svg" alt="DigitalFob" width={40} height={40} />
          </div>
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold">DigitalFob</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to access your operations dashboard
            </p>
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
              <p className="text-xs text-center text-muted-foreground">
                <Link href="/auth/forgot-password" className="underline underline-offset-2">
                  Forgot password?
                </Link>
              </p>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              <span className="block">This is a private application.</span>
              <span className="block">Access is restricted to authorized users only.</span>
            </p>

            <p className="text-xs text-center text-muted-foreground">
              Need access?{' '}
              <Link href="/request-access" className="underline underline-offset-2">
                Submit a request
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
