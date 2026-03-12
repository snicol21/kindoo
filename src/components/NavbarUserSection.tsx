import { getPendingAccessRequestCount } from '@/actions/access-requests';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/_ui/avatar';
import { Button } from '@/components/_ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/_ui/dropdown-menu';
import { PwaBadgeSync } from '@/components/PwaBadgeSync';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isAdminEmail } from '@/lib/admin';
import { auth, signOut } from '@/lib/auth';
import { ROLE_LABELS, canAccessUserAdmin } from '@/lib/permissions';
import type { UserRole } from '@/schema/schema';
import { LayoutDashboard, LogOut, MessageSquare, Settings, Shield } from 'lucide-react';
import Link from 'next/link';

export async function NavbarUserSection() {
  const session = await auth();
  const isForcedPasswordMode = !!session?.user?.mustChangePassword;

  const userInitials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (session?.user?.email?.[0]?.toUpperCase() ?? '?');

  const displayRole = session?.user
    ? isAdminEmail(session.user.email ?? null)
      ? 'admin'
      : ((session.user.role ?? 'ward_user') as UserRole)
    : null;

  const canAccessAdmin =
    !isForcedPasswordMode && displayRole ? canAccessUserAdmin(displayRole) : false;
  const pendingResult = canAccessAdmin ? await getPendingAccessRequestCount() : null;
  const pendingCount = pendingResult?.success ? (pendingResult.data?.count ?? 0) : 0;
  const pendingCountLabel = pendingCount > 9 ? '9+' : String(pendingCount);
  const pwaBadgeCount = canAccessAdmin ? pendingCount : 0;

  return (
    <div className="flex items-center gap-3">
      <PwaBadgeSync count={pwaBadgeCount} />
      {session?.user ? (
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Welcome back
            {session.user.name ? `, ${session.user.name.split(' ')[0]}` : ''}
          </span>
          <span className="hidden text-muted-foreground/60 sm:inline">|</span>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full p-0"
                aria-label="User menu"
              >
                <Avatar className="h-9 w-9 border border-border">
                  <AvatarImage
                    src={session.user.image ?? undefined}
                    alt={session.user.name ?? 'User'}
                  />
                  <AvatarFallback className="text-xs font-semibold">{userInitials}</AvatarFallback>
                </Avatar>
                {pendingCount > 0 && (
                  <span
                    className="absolute right-0 top-0 z-10 h-3 w-3 rounded-full bg-amber-500 ring-2 ring-background shadow-sm"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1 gap-0.5">
                  <p className="text-sm font-medium leading-none">{session.user.name ?? 'User'}</p>
                  <p className="text-xs leading-none text-muted-foreground">{session.user.email}</p>
                  {displayRole && (
                    <span className="w-fit rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ROLE_LABELS[displayRole]}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isForcedPasswordMode ? (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/change-password" className="gap-2 cursor-pointer">
                      <Settings className="h-4 w-4" />
                      Change temporary password
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="gap-2 cursor-pointer">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/account" className="gap-2 cursor-pointer">
                      <Settings className="h-4 w-4" />
                      Account settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/message-templates" className="gap-2 cursor-pointer">
                      <MessageSquare className="h-4 w-4" />
                      Message templates
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {canAccessAdmin && (
                    <DropdownMenuItem asChild>
                      <Link
                        href="/admin/users"
                        className="flex w-full items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          User admin
                        </span>
                        {pendingCount > 0 && (
                          <span className="inline-flex h-5 w-fit min-w-5 shrink-0 items-center justify-center rounded-full border border-amber-600 bg-amber-500 px-1.5 text-[10px] font-semibold leading-none text-white dark:border-amber-500 dark:bg-amber-500 dark:text-white">
                            {pendingCountLabel} Pending
                          </span>
                        )}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem asChild>
                <form
                  action={async () => {
                    'use server';
                    await signOut({ redirectTo: '/' });
                  }}
                >
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/auth/signin">Sign in</Link>
          </Button>
        </>
      )}
    </div>
  );
}
