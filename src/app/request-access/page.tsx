import { submitAccessRequest } from '@/actions/access-requests';
import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import { Textarea } from '@/components/_ui/textarea';
import { PageContainer } from '@/components/PageContainer';
import { PhoneInput } from '@/components/PhoneInput';
import { WARDS, type Ward } from '@/schema/schema';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Request access',
};

interface RequestAccessPageProps {
  searchParams: Promise<{ submitted?: string; error?: string }>;
}

export default async function RequestAccessPage({ searchParams }: RequestAccessPageProps) {
  const params = await searchParams;
  const isSubmitted = params.submitted === '1';
  const errorMessage = params.error ? decodeURIComponent(params.error) : null;

  if (isSubmitted) {
    return (
      <PageContainer className="max-w-md pt-12 sm:pt-16">
        <Card>
          <CardHeader>
            <CardTitle>Request submitted</CardTitle>
            <CardDescription>
              Your request was sent successfully. A manager will review it shortly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You will receive temporary sign-in credentials by email if approved.
            </p>
            <div className="flex w-full justify-center">
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <Button asChild variant="outline">
                  <Link href="/request-access">Submit another request</Link>
                </Button>
                <Button asChild>
                  <Link href="/auth/signin">Back to sign in</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="max-w-md pt-12 sm:pt-16">
      <div className="space-y-6">
        {errorMessage && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">
            {errorMessage}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Request access</CardTitle>
            <CardDescription>
              Submit your details for account approval by an admin, stake manager, or your ward
              manager.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData: FormData) => {
                'use server';
                const result = await submitAccessRequest({
                  email: String(formData.get('email') ?? ''),
                  name: String(formData.get('name') ?? ''),
                  phone: String(formData.get('phone') ?? ''),
                  ward: String(formData.get('ward') ?? '') as Ward,
                  comments: String(formData.get('comments') ?? ''),
                });

                if (!result.success) {
                  redirect(
                    `/request-access?error=${encodeURIComponent(result.error ?? 'Failed to submit request.')}`
                  );
                }

                redirect('/request-access?submitted=1');
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="user@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" type="text" placeholder="Name" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <PhoneInput id="phone" name="phone" placeholder="(555) 000-0000" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ward">Ward</Label>
                <select
                  id="ward"
                  name="ward"
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select ward
                  </option>
                  {WARDS.map((ward) => (
                    <option key={ward} value={ward}>
                      {ward}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comments">Additional comments (optional)</Label>
                <Textarea
                  id="comments"
                  name="comments"
                  maxLength={1000}
                  rows={4}
                  placeholder="Share any context that helps us determine the right role."
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button asChild variant="outline">
                  <Link href="/auth/signin">Back to sign in</Link>
                </Button>
                <Button type="submit">Submit request</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
