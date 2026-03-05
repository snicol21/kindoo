import { auth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/admin';
import { redirect } from 'next/navigation';
import { Button } from '@/components/_ui/button';
import type { Metadata } from 'next';
import { listUsers } from '@/actions/auth';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AdminUsersClient } from '@/components/AdminUsersClient';
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
      <div className="sticky top-2 z-10 w-fit rounded-md bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 sm:static sm:bg-transparent sm:backdrop-blur-none">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
      <AdminUsersClient users={managedUsers} currentUserId={currentUserId ?? ''} />
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
