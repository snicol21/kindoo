'use client';

import { Button } from '@/components/_ui/button';
import { CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Plus } from 'lucide-react';

type AdminUsersHeaderProps = {
  onCreateUserAction: () => void;
};

export function AdminUsersHeader({ onCreateUserAction }: AdminUsersHeaderProps) {
  return (
    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle>Users</CardTitle>
        <CardDescription>Manage roles, passwords, and access.</CardDescription>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <Button onClick={onCreateUserAction} className="gap-2">
          <Plus className="h-4 w-4" />
          Create user
        </Button>
      </div>
    </CardHeader>
  );
}
