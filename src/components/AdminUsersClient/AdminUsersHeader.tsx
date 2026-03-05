'use client';

import { Button } from '@/components/_ui/button';
import { CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import { Plus } from 'lucide-react';
import { USER_ROLES } from '@/schema/schema';
import type { RoleFilter } from '@/components/AdminUsersClient/types';

type AdminUsersHeaderProps = {
  roleFilter: RoleFilter;
  onRoleFilterChangeAction: (value: RoleFilter) => void;
  onCreateUserAction: () => void;
};

export function AdminUsersHeader({
  roleFilter,
  onRoleFilterChangeAction,
  onCreateUserAction,
}: AdminUsersHeaderProps) {
  return (
    <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <CardTitle>Users</CardTitle>
        <CardDescription>Manage roles, passwords, and access.</CardDescription>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <Select
          value={roleFilter}
          onValueChange={(value) => onRoleFilterChangeAction(value as RoleFilter)}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {USER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={onCreateUserAction} className="gap-2">
          <Plus className="h-4 w-4" />
          Create User
        </Button>
      </div>
    </CardHeader>
  );
}
