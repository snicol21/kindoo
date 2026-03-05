'use client';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { KeyRound, Mail, Shield, Trash2 } from 'lucide-react';
import type { ManagedUser } from '@/components/AdminUsersClient/types';

type UsersTableProps = {
  users: ManagedUser[];
  currentUserId: string;
  onOpenRoleAction: (user: ManagedUser) => void;
  onOpenPasswordAction: (user: ManagedUser) => void;
  onOpenDeleteAction: (user: ManagedUser) => void;
};

export function UsersTable({
  users,
  currentUserId,
  onOpenRoleAction,
  onOpenPasswordAction,
  onOpenDeleteAction,
}: UsersTableProps) {
  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">No users found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-t-md rounded-b-none border-b">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-80">User</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="align-top">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {user.name?.trim() || 'No name set'}
                    </span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {user.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right">
                {user.id === currentUserId ? (
                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    You
                  </span>
                ) : (
                  <div className="flex justify-end gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Change role for ${user.email}`}
                      onClick={() => onOpenRoleAction(user)}
                    >
                      <Shield className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Change password for ${user.email}`}
                      onClick={() => onOpenPasswordAction(user)}
                    >
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${user.email}`}
                      onClick={() => onOpenDeleteAction(user)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
