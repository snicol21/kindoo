import { auth, signOut } from '@/lib/auth';
import Link from 'next/link';
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
import { ThemeToggle } from '@/components/ThemeToggle';
import { LayoutDashboard, Settings, Shield, LogOut, MessageSquare } from 'lucide-react';
import { isAdminEmail } from '@/lib/admin';
import { ROLE_LABELS, canAccessUserAdmin } from '@/lib/permissions';
import type { UserRole } from '@/schema/schema';

export async function NavbarUserSection() {
  const session = await auth();

  const userInitials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (session?.user?.email?.[0]?.toUpperCase() ?? '?');

  const displayRole = session?.user
    ? (isAdminEmail(session.user.email ?? null)
        ? 'admin'
        : ((session.user.role ?? 'ward_user') as UserRole))
    : null;

  return (
    <div className="flex items-center gap-3">
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
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1 gap-0.5">
                  <p className="text-sm font-medium leading-none">
                    {session.user.name ?? 'User'}
                  </p>
                  <p className="text-xs leading-none text-muted-foreground">{session.user.email}</p>
                  {displayRole && (
                    <span className="w-fit rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {ROLE_LABELS[displayRole]}
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="gap-2 cursor-pointer">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account" className="gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Account Settings
                </Link>
              </DropdownMenuItem>
              {canAccessUserAdmin(
                isAdminEmail(session.user.email ?? null)
                  ? 'admin'
                  : ((session.user.role ?? 'ward_user') as UserRole)
              ) && (
                <DropdownMenuItem asChild>
                  <Link href="/admin/users" className="gap-2 cursor-pointer">
                    <Shield className="h-4 w-4" />
                    User Admin
                  </Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/message-templates" className="gap-2 cursor-pointer">
                  <MessageSquare className="h-4 w-4" />
                  Message templates
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
                    Sign Out
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
            <Link href="/auth/signin">Sign In</Link>
          </Button>
        </>
      )}
    </div>
  );
}
