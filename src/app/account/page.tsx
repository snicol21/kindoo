import { changePassword, changeProfile } from '@/actions/auth';
import { updateNotificationPreferences } from '@/actions/notification-preferences';
import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import { PasswordInput } from '@/components/_ui/password-input';
import { DefaultBuildingSetting } from '@/components/DefaultBuildingSetting';
import { PageContainer } from '@/components/PageContainer';
import { PhoneInput } from '@/components/PhoneInput';
import { ProfileImageUploader } from '@/components/ProfileImageUploader';
import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  canRoleEnableSms,
  loadNotificationPreferencesForUser,
  loadSmsRoleAccessConfig,
} from '@/lib/notification-preferences';
import { ROLE_LABELS } from '@/lib/permissions';
import type { UserRole } from '@/schema/schema';
import { users } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Account settings',
};

interface AccountPageProps {
  searchParams: Promise<{
    updated?: string;
    nameUpdated?: string;
    imageUpdated?: string;
    notificationUpdated?: string;
    forcePasswordChange?: string;
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

  const notificationPreferences = await loadNotificationPreferencesForUser(session.user.id);
  const smsRoleAccessConfig = await loadSmsRoleAccessConfig();
  const canEnableSmsMessaging = canRoleEnableSms(role, smsRoleAccessConfig);

  const message = params.error
    ? decodeURIComponent(params.error)
    : params.forcePasswordChange === '1'
      ? 'You must change your temporary password before using the app.'
      : params.imageUpdated === '1'
        ? 'Profile photo updated.'
        : params.notificationUpdated === '1'
          ? 'Notification preferences updated.'
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
            <CardDescription>
              Update your profile details. Ward is managed by user admins.
            </CardDescription>
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

        <Card>
          <CardHeader>
            <CardTitle>SMS notifications</CardTitle>
            <CardDescription>
              {canEnableSmsMessaging
                ? 'Choose which app events should send SMS alerts to your phone.'
                : 'SMS rollout is currently admin-only during testing.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData: FormData) => {
                'use server';

                const result = await updateNotificationPreferences({
                  smsEnabled: formData.get('smsEnabled') === 'on',
                  smsPhone: String(formData.get('smsPhone') ?? ''),
                  accessRequestSubmittedSms: formData.get('accessRequestSubmittedSms') === 'on',
                  licenseJobCompletedSms: formData.get('licenseJobCompletedSms') === 'on',
                  licenseJobFailedSms: formData.get('licenseJobFailedSms') === 'on',
                  eventCreatedSms: formData.get('eventCreatedSms') === 'on',
                });

                if (!result.success) {
                  const msg = encodeURIComponent(
                    result.error ?? 'Failed to update notification preferences.'
                  );
                  redirect(`/account?error=${msg}`);
                }

                redirect('/account?notificationUpdated=1');
              }}
              className="space-y-4"
            >
              <div className="space-y-3">
                <Label className="flex items-center gap-3" htmlFor="smsEnabled">
                  <input
                    id="smsEnabled"
                    name="smsEnabled"
                    type="checkbox"
                    defaultChecked={notificationPreferences.smsEnabled}
                    disabled={!canEnableSmsMessaging}
                  />
                  Enable SMS notifications
                </Label>
              </div>

              <div className="space-y-3">
                <Label htmlFor="smsPhone">SMS phone (optional override)</Label>
                <PhoneInput
                  id="smsPhone"
                  name="smsPhone"
                  defaultValue={notificationPreferences.smsPhone || phone}
                  disabled={!canEnableSmsMessaging}
                />
              </div>

              {!canEnableSmsMessaging && (
                <p className="text-xs text-muted-foreground">
                  SMS enablement is currently disabled for your role by admin configuration.
                </p>
              )}

              <div className="space-y-3 rounded-md border border-border p-3">
                <Label className="flex items-center gap-3" htmlFor="accessRequestSubmittedSms">
                  <input
                    id="accessRequestSubmittedSms"
                    name="accessRequestSubmittedSms"
                    type="checkbox"
                    defaultChecked={notificationPreferences.accessRequestSubmittedSms}
                  />
                  New access requests submitted
                </Label>
                <Label className="flex items-center gap-3" htmlFor="licenseJobCompletedSms">
                  <input
                    id="licenseJobCompletedSms"
                    name="licenseJobCompletedSms"
                    type="checkbox"
                    defaultChecked={notificationPreferences.licenseJobCompletedSms}
                  />
                  Kindoo worker job completed
                </Label>
                <Label className="flex items-center gap-3" htmlFor="licenseJobFailedSms">
                  <input
                    id="licenseJobFailedSms"
                    name="licenseJobFailedSms"
                    type="checkbox"
                    defaultChecked={notificationPreferences.licenseJobFailedSms}
                  />
                  Kindoo worker job failed
                </Label>
                <Label className="flex items-center gap-3" htmlFor="eventCreatedSms">
                  <input
                    id="eventCreatedSms"
                    name="eventCreatedSms"
                    type="checkbox"
                    defaultChecked={notificationPreferences.eventCreatedSms}
                  />
                  New events created by others
                </Label>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Save notification preferences
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
