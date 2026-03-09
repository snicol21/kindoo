'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/_ui/button';
import { SearchInput } from '@/components/SearchInput';
import { AdminUsersClient } from '@/components/AdminUsersClient';
import type { AdminUsersClientProps } from '@/components/AdminUsersClient/types';

export function AdminUsersPageClient({
  users,
  currentUserId,
  currentUserRole,
  currentUserWard,
}: AdminUsersClientProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-6">
      <div className="sticky top-2 z-10 flex w-full flex-col gap-3 rounded-md bg-background/95 p-2 backdrop-blur supports-backdrop-filter:bg-background/80 sm:static sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <Button asChild variant="ghost" size="sm" className="w-fit gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
        <SearchInput
          value={searchQuery}
          onValueChangeAction={setSearchQuery}
          placeholder="Search users"
          className="w-full sm:w-64"
        />
      </div>

      <AdminUsersClient
        users={users}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        currentUserWard={currentUserWard}
        searchQuery={searchQuery}
      />
    </div>
  );
}
