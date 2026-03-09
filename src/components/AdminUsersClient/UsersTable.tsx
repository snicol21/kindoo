'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/_ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/_ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/_ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/_ui/tooltip';
import { KeyRound, Mail, MoreVertical, Shield, Trash2 } from 'lucide-react';
import type { ManagedUser } from '@/components/AdminUsersClient/types';
import type { UserRole } from '@/schema/schema';
import { ROLE_LABELS, canManageUser } from '@/lib/permissions';

type UsersTableProps = {
  users: ManagedUser[];
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserWard: string;
  onOpenRoleAction: (user: ManagedUser) => void;
  onOpenPasswordAction: (user: ManagedUser) => void;
  onOpenDeleteAction: (user: ManagedUser) => void;
};

export function UsersTable({
  users,
  currentUserId,
  currentUserRole,
  currentUserWard,
  onOpenRoleAction,
  onOpenPasswordAction,
  onOpenDeleteAction,
}: UsersTableProps) {
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const syncMobileBreakpoint = () => setIsMobileView(mobileQuery.matches);

    syncMobileBreakpoint();

    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', syncMobileBreakpoint);
      return () => {
        mobileQuery.removeEventListener('change', syncMobileBreakpoint);
      };
    }

    mobileQuery.addListener(syncMobileBreakpoint);
    return () => {
      mobileQuery.removeListener(syncMobileBreakpoint);
    };
  }, []);

  if (users.length === 0) {
    return <p className="text-sm text-muted-foreground">No users found.</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
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
                    {(() => {
                      const canManage =
                        canManageUser(currentUserRole, user.role) &&
                        (currentUserRole !== 'ward_manager' || user.ward === currentUserWard);
                      return (
                        <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {user.name?.trim() || 'No name set'}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                        {ROLE_LABELS[user.role]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ward: {user.ward} | Phone: {user.phone}
                    </div>
                    {!canManage && user.id !== currentUserId && (
                      <p className="w-fit rounded-sm bg-yellow-200/35 px-1.5 py-0.5 text-xs italic text-yellow-900/80 dark:bg-yellow-300/20 dark:text-yellow-100/85">
                        No permission to manage this user.
                      </p>
                    )}
                        </>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {user.id === currentUserId ? (
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      You
                    </span>
                  ) : (
                    <>
                      {isMobileView ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 border border-border bg-secondary/60 text-foreground hover:bg-secondary"
                              aria-label={`Actions for ${user.email}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              disabled={
                                !canManageUser(currentUserRole, user.role) ||
                                (currentUserRole === 'ward_manager' && user.ward !== currentUserWard)
                              }
                              onSelect={() => onOpenRoleAction(user)}
                            >
                              <Shield className="h-4 w-4" />
                              Change role
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !canManageUser(currentUserRole, user.role) ||
                                (currentUserRole === 'ward_manager' && user.ward !== currentUserWard)
                              }
                              onSelect={() => onOpenPasswordAction(user)}
                            >
                              <KeyRound className="h-4 w-4" />
                              Change password
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={
                                !canManageUser(currentUserRole, user.role) ||
                                (currentUserRole === 'ward_manager' && user.ward !== currentUserWard)
                              }
                              onSelect={() => onOpenDeleteAction(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete user
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Change role for ${user.email}`}
                                disabled={
                                  !canManageUser(currentUserRole, user.role) ||
                                  (currentUserRole === 'ward_manager' &&
                                    user.ward !== currentUserWard)
                                }
                                onClick={() => onOpenRoleAction(user)}
                              >
                                <Shield className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Change role</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Change password for ${user.email}`}
                                disabled={
                                  !canManageUser(currentUserRole, user.role) ||
                                  (currentUserRole === 'ward_manager' &&
                                    user.ward !== currentUserWard)
                                }
                                onClick={() => onOpenPasswordAction(user)}
                              >
                                <KeyRound className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Change password</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Delete ${user.email}`}
                                disabled={
                                  !canManageUser(currentUserRole, user.role) ||
                                  (currentUserRole === 'ward_manager' &&
                                    user.ward !== currentUserWard)
                                }
                                onClick={() => onOpenDeleteAction(user)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete user</TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}
