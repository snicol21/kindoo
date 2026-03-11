import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/_ui/card';
import { AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Auth Error' };

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] justify-center px-4 pt-[10vh]">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle>Authentication Error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Something went wrong during sign in. Please try again.
          </p>
          <Button asChild>
            <Link href="/auth/signin">Back to Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
