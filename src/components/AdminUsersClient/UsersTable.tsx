'use client';

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
import type { ManagedUser } from '@/components/AdminUsersClient/types';
import { ROLE_LABELS, canManageUser } from '@/lib/permissions';
import type { UserRole } from '@/schema/schema';
import { Copy, Mail, MoreVertical, Pencil, Phone, Trash2 } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { toast } from 'sonner';

type UsersTableProps = {
  users: ManagedUser[];
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserWard: string;
  onOpenEditAction: (user: ManagedUser) => void;
  onOpenDeleteAction: (user: ManagedUser) => void;
};

export function UsersTable({
  users,
  currentUserId,
  currentUserRole,
  currentUserWard,
  onOpenEditAction,
  onOpenDeleteAction,
}: UsersTableProps) {
  const [isMobileView, setIsMobileView] = useState(false);

  useLayoutEffect(() => {
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
                            <span className="text-xs text-muted-foreground">
                              • {user.ward || '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`mailto:${user.email}`}
                                className="max-w-44 truncate text-muted-foreground hover:underline"
                                title={user.email}
                              >
                                {user.email}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                aria-label={`Copy email for ${user.email}`}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(user.email ?? '');
                                    toast.success('Email copied.');
                                  } catch {
                                    toast.error('Failed to copy.');
                                  }
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            {user.phone ? (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <a
                                  href={`tel:${user.phone.replace(/\D/g, '')}`}
                                  className="max-w-44 truncate hover:text-foreground hover:underline"
                                  title={user.phone}
                                >
                                  {user.phone}
                                </a>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0"
                                  aria-label={`Copy phone for ${user.email}`}
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(user.phone ?? '');
                                      toast.success('Phone copied.');
                                    } catch {
                                      toast.error('Failed to copy.');
                                    }
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
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
                                (currentUserRole === 'ward_manager' &&
                                  user.ward !== currentUserWard)
                              }
                              onSelect={() => onOpenEditAction(user)}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit user
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={
                                !canManageUser(currentUserRole, user.role) ||
                                (currentUserRole === 'ward_manager' &&
                                  user.ward !== currentUserWard)
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
                                aria-label={`Edit ${user.email}`}
                                disabled={
                                  !canManageUser(currentUserRole, user.role) ||
                                  (currentUserRole === 'ward_manager' &&
                                    user.ward !== currentUserWard)
                                }
                                onClick={() => onOpenEditAction(user)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit user</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive focus-visible:text-destructive"
                                aria-label={`Delete ${user.email}`}
                                disabled={
                                  !canManageUser(currentUserRole, user.role) ||
                                  (currentUserRole === 'ward_manager' &&
                                    user.ward !== currentUserWard)
                                }
                                onClick={() => onOpenDeleteAction(user)}
                              >
                                <Trash2 className="h-4 w-4" />
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
