import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import NextTopLoader from 'nextjs-toploader';
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
      <body className="font-inter antialiased bg-background text-foreground min-h-screen flex flex-col">
        <NextTopLoader color="#2563eb" height={3} showSpinner={false} />
        <Suspense fallback={<NavbarSkeleton />}>
          <Providers>
            {/* Navbar is now a static shell — auth is isolated inside NavbarUserSection */}
            <Suspense fallback={<NavbarSkeleton />}>
              <Navbar />
            </Suspense>
            <main className="flex-1 min-h-[calc(100vh-4rem)]">{children}</main>
            <footer className="border-t bg-muted/20">
              <div className="container mx-auto max-w-7xl px-4 py-4 text-xs leading-relaxed text-muted-foreground">
                <p>
                  Event Tracker is an independent local utility, not affiliated with or endorsed by{' '}
                  <a
                    href="https://churchofjesuschrist.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 decoration-muted-foreground/60 hover:text-foreground"
                  >
                    The Church of Jesus Christ of Latter-day Saints
                  </a>{' '}
                  or{' '}
                  <a
                    href="https://kindoo.tech"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 decoration-muted-foreground/60 hover:text-foreground"
                  >
                    Kindoo
                  </a>
                  .
                </p>
                <p className="mt-1">
                  For support, contact Spencer Nicol (spencer.nicol@gmail.com).
                </p>
                <p className="mt-1">Kindoo is a trademark of its respective owner.</p>
              </div>
            </footer>
          </Providers>
        </Suspense>
      </body>
    </html>
  );
}
