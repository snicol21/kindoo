import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CalendarDays } from 'lucide-react';
import { Suspense } from 'react';
import { NavbarUserSection } from '@/components/NavbarUserSection';
import { Button } from '@/components/ui/button';

function NavbarUserFallback() {
  return (
    <div className="flex items-center gap-3">
      <ThemeToggle />
      <Button asChild size="sm">
        <Link href="/auth/signin">Sign In</Link>
      </Button>
    </div>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo — static, no auth needed */}
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold hover:opacity-80 transition-opacity"
        >
          <CalendarDays className="h-5 w-5 text-primary" />
          <span>Event Tracker</span>
        </Link>

        {/* Right side — isolated async boundary */}
        <Suspense fallback={<NavbarUserFallback />}>
          <NavbarUserSection />
        </Suspense>
      </div>
    </header>
  );
}
