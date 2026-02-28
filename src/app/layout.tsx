import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { Providers } from '@/providers/providers';
import { Navbar } from '@/components/Navbar';
import '@/app/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Event Tracker', template: '%s | Event Tracker' },
  description: 'Private event tracker for Stake Center and Maples Building events.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded bg-muted" />
          <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-inter antialiased bg-background text-foreground min-h-screen">
        <Suspense fallback={<NavbarSkeleton />}>
          <Providers>
            {/* Navbar is now a static shell — auth is isolated inside NavbarUserSection */}
            <Suspense fallback={<NavbarSkeleton />}>
              <Navbar />
            </Suspense>
            <main className="min-h-[calc(100vh-4rem)]">{children}</main>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
