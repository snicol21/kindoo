import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { redirect } from 'next/navigation';
import { Button } from '@/components/_ui/button';
import type { Metadata } from 'next';
import { listUsers } from '@/actions/auth';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AdminUsersPageClient } from '@/components/AdminUsersClient/AdminUsersPageClient';
import { PageContainer } from '@/components/PageContainer';

export const metadata: Metadata = {
  title: 'User Admin',
};

export default async function AdminUsersPage() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const currentUserId = session?.user?.id ?? null;

  const isAdmin = session?.user?.role === 'admin' || isAdminEmail(email);
  if (!email || !isAdmin) {
    redirect('/auth/signin');
  }

  const usersResult = await listUsers();
  const managedUsers = usersResult.success ? (usersResult.data ?? []) : [];

  return (
    <PageContainer width="narrow" className="space-y-6">
      <AdminUsersPageClient users={managedUsers} currentUserId={currentUserId ?? ''} />
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
