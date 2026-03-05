import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { LicenseLeadTimeSetting } from '@/components/LicenseLeadTimeSetting';
import { DefaultBuildingSetting } from '@/components/DefaultBuildingSetting';
import { changeProfile, changePassword } from '@/actions/auth';
import { db } from '@/lib/db';
import { users } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Account Settings',
};

interface AccountPageProps {
  searchParams: Promise<{ updated?: string; nameUpdated?: string; error?: string }>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  const userRecord = await db
    .select({
      licenseLeadDays: users.licenseLeadDays,
      defaultBuilding: users.defaultBuilding,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const licenseLeadDays = userRecord[0]?.licenseLeadDays ?? null;
  const defaultBuilding = userRecord[0]?.defaultBuilding ?? 'Stake Center';

  const message = params.error
    ? decodeURIComponent(params.error)
    : params.nameUpdated === '1'
      ? 'Name updated.'
      : params.updated === '1'
        ? 'Password updated.'
        : null;

  return (
    <div className="container mx-auto max-w-xl px-4 py-8">
      <div className="sticky top-2 z-10 mb-6 w-fit rounded-md bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 sm:static sm:bg-transparent sm:backdrop-blur-none">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
      <div className="space-y-6">
        {message && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">{message}</div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update how your name appears in the app.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData: FormData) => {
                'use server';
                const result = await changeProfile({
                  name: String(formData.get('name') ?? ''),
                });

                if (!result.success) {
                  const msg = encodeURIComponent(result.error ?? 'Failed to update name.');
                  redirect(`/account?error=${msg}`);
                }

                redirect('/account?nameUpdated=1');
              }}
              className="space-y-4"
            >
              <div className="space-y-3">
                <Label htmlFor="name">Display name</Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Your name"
                  defaultValue={session.user.name ?? ''}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Update profile name
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change your password to keep your account secure.</CardDescription>
          </CardHeader>
          <CardContent>
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
                  redirect(`/account?error=${msg}`);
                }

                redirect('/account?updated=1');
              }}
              className="space-y-4"
            >
              <div className="space-y-3">
                <Label htmlFor="currentPassword">Current password</Label>
                <PasswordInput id="currentPassword" name="currentPassword" />
              </div>
              <div className="space-y-3">
                <Label htmlFor="newPassword">New password</Label>
                <PasswordInput id="newPassword" name="newPassword" />
              </div>
              <div className="space-y-3">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <PasswordInput id="confirmPassword" name="confirmPassword" />
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dashboard</CardTitle>
            <CardDescription>
              Choose your default building for dashboard and new events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DefaultBuildingSetting initialDefaultBuilding={defaultBuilding} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kindoo License</CardTitle>
            <CardDescription>
              Choose how many days before an event you want to enable license creation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LicenseLeadTimeSetting initialLeadDays={licenseLeadDays} />
          </CardContent>
        </Card>
      </div>
      <div className="mt-8">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
