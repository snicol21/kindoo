import '@/app/globals.css';
import { BootLoader } from '@/components/BootLoader';
import { DevServiceWorkerReset } from '@/components/DevServiceWorkerReset';
import { Navbar } from '@/components/Navbar';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { Providers } from '@/providers/providers';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import NextTopLoader from 'nextjs-toploader';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'DigitalFob', template: '%s | DigitalFob' },
  applicationName: 'DigitalFob',
  description: 'Private operations dashboard for Stake Center and Maples Building events.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DigitalFob',
  },
  icons: {
    shortcut: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/icons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/icons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={inter.variable}
      style={{ scrollPaddingTop: '5rem' }}
    >
      <body
        suppressHydrationWarning
        className="font-inter antialiased bg-background text-foreground min-h-screen flex flex-col"
      >
        {process.env.NODE_ENV === 'development' ? <DevServiceWorkerReset /> : null}
        <BootLoader />
        <NextTopLoader color="#2563eb" height={3} showSpinner={false} />
        <Providers>
          {/* Navbar is now a static shell — auth is isolated inside NavbarUserSection */}
          <Navbar />
          <PwaInstallBanner />
          <main className="flex-1 min-h-[calc(100vh-4rem)]">{children}</main>
          <footer className="border-t bg-muted/20">
            <div className="container mx-auto max-w-7xl px-4 py-4 text-xs leading-relaxed text-muted-foreground text-center">
              <p>
                Independent local utility.{' '}
                <span className="block sm:inline">
                  Not affiliated with{' '}
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
                </span>
              </p>
              <p className="mt-1">Support: Spencer Nicol (spencer.nicol@gmail.com).</p>
              <p className="mt-1">
                <a
                  href="/policies#sms-policy"
                  className="underline underline-offset-2 decoration-muted-foreground/60 hover:text-foreground"
                >
                  SMS Policy
                </a>
                {' · '}
                <a
                  href="/policies#privacy"
                  className="underline underline-offset-2 decoration-muted-foreground/60 hover:text-foreground"
                >
                  Privacy Policy
                </a>
                {' · '}
                <a
                  href="/policies#terms"
                  className="underline underline-offset-2 decoration-muted-foreground/60 hover:text-foreground"
                >
                  Terms of Service
                </a>
              </p>
              <p className="mt-1">Kindoo is a trademark of its respective owner.</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
