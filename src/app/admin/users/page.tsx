import { listAccessRequests } from '@/actions/access-requests';
import { listUsers } from '@/actions/auth';
import { Button } from '@/components/_ui/button';
import { AdminUsersPageClient } from '@/components/AdminUsersClient/AdminUsersPageClient';
import { PageContainer } from '@/components/PageContainer';
import { isAdminEmail } from '@/lib/admin';
import { auth } from '@/lib/auth';
import { canAccessUserAdmin } from '@/lib/permissions';
import type { UserRole } from '@/schema/schema';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'User admin',
};

export default async function AdminUsersPage() {
  const session = await auth();
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

  return (
    <PageContainer width="narrow" className="space-y-6">
      <AdminUsersPageClient
        users={managedUsers}
        currentUserId={currentUserId ?? ''}
        currentUserRole={currentUserRole}
        currentUserWard={currentUserWard}
        accessRequests={accessRequests}
      />
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
