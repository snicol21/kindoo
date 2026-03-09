import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Input } from '@/components/_ui/input';
import { PasswordInput } from '@/components/_ui/password-input';
import { Button } from '@/components/_ui/button';
import { Label } from '@/components/_ui/label';
import { DefaultBuildingSetting } from '@/components/DefaultBuildingSetting';
import { changeProfile, changePassword } from '@/actions/auth';
import { db } from '@/lib/db';
import { users } from '@/schema/schema';
import type { UserRole } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import { ProfileImageUploader } from '@/components/ProfileImageUploader';
import { PhoneInput } from '@/components/PhoneInput';
import { ROLE_LABELS } from '@/lib/permissions';
import { isAdminEmail } from '@/lib/admin';

export const metadata: Metadata = {
  title: 'Account Settings',
};

interface AccountPageProps {
  searchParams: Promise<{
    updated?: string;
    nameUpdated?: string;
    imageUpdated?: string;
    error?: string;
  }>;
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.email) {
    redirect('/auth/signin');
  }

  const userRecord = await db
    .select({
      defaultBuilding: users.defaultBuilding,
      ward: users.ward,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const defaultBuilding = userRecord[0]?.defaultBuilding ?? 'Stake Center';
  const ward = userRecord[0]?.ward ?? '1st Ward';
  const phone = userRecord[0]?.phone ?? '';
  const canUpdateDefaultBuilding = session.user.role === 'stake_manager';
  const role: UserRole = isAdminEmail(session.user.email ?? null)
    ? 'admin'
    : ((session.user.role ?? 'ward_user') as UserRole);

  const message = params.error
    ? decodeURIComponent(params.error)
    : params.imageUpdated === '1'
      ? 'Profile photo updated.'
      : params.nameUpdated === '1'
        ? 'Name updated.'
        : params.updated === '1'
          ? 'Password updated.'
          : null;

  const userInitials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (session?.user?.email?.[0]?.toUpperCase() ?? '?');

  return (
    <PageContainer width="narrow">
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
            <CardDescription>Update your profile details. Ward is managed by user admins.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <form
                action={async (formData: FormData) => {
                  'use server';
                  const result = await changeProfile({
                    name: String(formData.get('name') ?? ''),
                    phone: String(formData.get('phone') ?? ''),
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
                <div className="space-y-3">
                  <Label htmlFor="role">Role</Label>
                  <Input id="role" value={ROLE_LABELS[role]} readOnly disabled />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="ward">Ward</Label>
                  <Input id="ward" value={ward} readOnly disabled />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="phone">Phone</Label>
                  <PhoneInput id="phone" name="phone" defaultValue={phone} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary">
                    Update profile
                  </Button>
                </div>
              </form>

              <ProfileImageUploader
                initialImageUrl={session.user.image ?? null}
                initials={userInitials}
                displayName={session.user.name ?? 'User'}
              />
            </div>
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

        {canUpdateDefaultBuilding && (
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
        )}
      </div>
      <div className="mt-8">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </PageContainer>
  );
}
