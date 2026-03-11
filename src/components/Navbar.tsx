import { NavbarUserSection } from '@/components/NavbarUserSection';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

function NavbarUserFallback() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="h-8 w-8 animate-pulse rounded bg-muted" />
      <div className="h-9 w-24 animate-pulse rounded bg-muted" />
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
