import { NavbarUserSection } from '@/components/NavbarUserSection';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

function NavbarUserFallback() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div className="hidden h-4 w-28 animate-pulse rounded bg-muted sm:block" />
      <div className="hidden h-4 w-px animate-pulse rounded bg-muted sm:block" />
      <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
      <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
    </div>
  );
}

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo — static, no auth needed */}
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold hover:opacity-80 transition-opacity"
        >
          <Image src="/icons/favicon.svg" alt="DigitalFob" width={20} height={20} />
          <span>DigitalFob</span>
        </Link>

        {/* Right side — isolated async boundary */}
        <Suspense fallback={<NavbarUserFallback />}>
          <NavbarUserSection />
        </Suspense>
      </div>
    </header>
  );
}
