// src/components/NavbarUserSection.tsx
import { connection } from 'next/server';
import { auth, signOut } from '@/lib/auth';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LayoutDashboard, Settings, Shield, LogOut } from 'lucide-react';
import { isAdminEmail } from '@/lib/admin';

export async function NavbarUserSection() {
  await connection();
  const session = await auth();

  const userInitials = session?.user?.name
    ? session.user.name
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (session?.user?.email?.[0]?.toUpperCase() ?? '?');

  return (
    <div className="flex items-center gap-3">
      <ThemeToggle />

      {session?.user ? (
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
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{session.user.name ?? 'User'}</p>
                <p className="text-xs leading-none text-muted-foreground">{session.user.email}</p>
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
              <Link href="/account/password" className="gap-2 cursor-pointer">
                <Settings className="h-4 w-4" />
                Account Settings
              </Link>
            </DropdownMenuItem>
            {isAdminEmail(session.user.email ?? null) && (
              <DropdownMenuItem asChild>
                <Link href="/admin/users" className="gap-2 cursor-pointer">
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              </DropdownMenuItem>
            )}
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
      ) : (
        <Button asChild size="sm">
          <Link href="/auth/signin">Sign In</Link>
        </Button>
      )}
    </div>
  );
}
