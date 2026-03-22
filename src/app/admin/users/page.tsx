import { listAccessRequests } from '@/actions/access-requests';
import { listUsers } from '@/actions/auth';
import { updateSmsRoleAccessConfig } from '@/actions/notification-preferences';
import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Label } from '@/components/_ui/label';
import { AdminUsersPageClient } from '@/components/AdminUsersClient/AdminUsersPageClient';
import { PageContainer } from '@/components/PageContainer';
import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { loadSmsRoleAccessConfig } from '@/lib/notification-preferences';
import { canAccessUserAdmin } from '@/lib/permissions';
import type { UserRole } from '@/schema/schema';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'User admin',
};

interface AdminUsersPageProps {
  searchParams: Promise<{
    smsRoleConfigUpdated?: string;
    error?: string;
  }>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const session = await auth();
  const params = await searchParams;
  const email = session?.user?.email ?? null;
  const currentUserId = session?.user?.id ?? null;
  const currentUserWard = session?.user?.ward ?? '1st Ward';
  const currentUserRole: UserRole = isAdminEmail(email)
    ? 'admin'
    : ((session?.user?.role ?? 'ward_user') as UserRole);

  if (!email || !canAccessUserAdmin(currentUserRole)) {
    redirect('/auth/signin');
  }

  const usersResult = await listUsers();
  const managedUsers = usersResult.success ? (usersResult.data ?? []) : [];
  const requestsResult = await listAccessRequests();
  const accessRequests = requestsResult.success ? (requestsResult.data ?? []) : [];
  const smsRoleAccess = await loadSmsRoleAccessConfig();
  const message = params.error
    ? decodeURIComponent(params.error)
    : params.smsRoleConfigUpdated === '1'
      ? 'SMS role access settings updated.'
      : null;
  const isAdmin = currentUserRole === 'admin';

  return (
    <PageContainer width="narrow" className="space-y-6">
      {message && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">{message}</div>
      )}

      <AdminUsersPageClient
        users={managedUsers}
        currentUserId={currentUserId ?? ''}
        currentUserRole={currentUserRole}
        currentUserWard={currentUserWard}
        accessRequests={accessRequests}
      />

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>SMS Role Access</CardTitle>
            <CardDescription>
              Control which roles are allowed to enable SMS notifications in account settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData: FormData) => {
                'use server';

                const result = await updateSmsRoleAccessConfig({
                  adminEnabled: formData.get('adminEnabled') === 'on',
                  stakeManagerEnabled: formData.get('stakeManagerEnabled') === 'on',
                  wardManagerEnabled: formData.get('wardManagerEnabled') === 'on',
                  wardUserEnabled: formData.get('wardUserEnabled') === 'on',
                });

                if (!result.success) {
                  const msg = encodeURIComponent(
                    result.error ?? 'Failed to update SMS role access.'
                  );
                  redirect(`/admin/users?error=${msg}`);
                }

                redirect('/admin/users?smsRoleConfigUpdated=1');
              }}
              className="space-y-3"
            >
              <Label className="flex items-center gap-3" htmlFor="adminEnabled">
                <input
                  id="adminEnabled"
                  name="adminEnabled"
                  type="checkbox"
                  defaultChecked={smsRoleAccess.adminEnabled}
                />
                Admin
              </Label>
              <Label className="flex items-center gap-3" htmlFor="stakeManagerEnabled">
                <input
                  id="stakeManagerEnabled"
                  name="stakeManagerEnabled"
                  type="checkbox"
                  defaultChecked={smsRoleAccess.stakeManagerEnabled}
                />
                Stake Manager
              </Label>
              <Label className="flex items-center gap-3" htmlFor="wardManagerEnabled">
                <input
                  id="wardManagerEnabled"
                  name="wardManagerEnabled"
                  type="checkbox"
                  defaultChecked={smsRoleAccess.wardManagerEnabled}
                />
                Ward Manager
              </Label>
              <Label className="flex items-center gap-3" htmlFor="wardUserEnabled">
                <input
                  id="wardUserEnabled"
                  name="wardUserEnabled"
                  type="checkbox"
                  defaultChecked={smsRoleAccess.wardUserEnabled}
                />
                Ward User
              </Label>

              <div className="flex justify-end">
                <Button type="submit" variant="secondary">
                  Save SMS role access
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div>
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
