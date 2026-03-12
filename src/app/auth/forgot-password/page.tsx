'use client';

import { requestPasswordReset } from '@/actions/auth';
import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Input } from '@/components/_ui/input';
import Link from 'next/link';
import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const result = await requestPasswordReset({ email });
      if (!result.success) {
        setError(result.error ?? 'Unable to process request.');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Unexpected server error. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] justify-center px-4 pt-[10vh]">
      <div className="w-full max-w-md space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Forgot password</CardTitle>
            <CardDescription>Request a new temporary password and sign in again.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {submitted ? (
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-300/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                  If that email is in our system, we sent a temporary password. Check your inbox and
                  then sign in.
                </div>
                <Button asChild className="w-full">
                  <Link href="/auth/signin">Back to sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                {error && (
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? 'Requesting...' : 'Send temporary password'}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  <Link href="/auth/signin" className="underline underline-offset-2">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
