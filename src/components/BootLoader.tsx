'use client';

import { LoaderVisual } from '@/components/LoaderVisual';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

// Public pages that render fully via SSR — no auth splash needed.
const PUBLIC_PATHS = ['/policies', '/auth', '/request-access'];

export function BootLoader() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(true);
  const [isRendered, setIsRendered] = useState(true);

  const skipLoader = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (skipLoader) {
      setIsRendered(false);
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const unlockScroll = () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };

    const MIN_VISIBLE_MS = 380;
    const FADE_DURATION_MS = 220;

    const fadeTimer = window.setTimeout(() => setIsVisible(false), MIN_VISIBLE_MS);
    const removeTimer = window.setTimeout(() => {
      unlockScroll();
      setIsRendered(false);
    }, MIN_VISIBLE_MS + FADE_DURATION_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
      unlockScroll();
    };
  }, [skipLoader]);

  if (!isRendered || skipLoader) return null;

  return (
    <div
      aria-label="Loading application"
      className={`fixed inset-0 pt-16 grid place-items-center overflow-hidden bg-background px-4 text-foreground transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ zIndex: 49 }}
    >
      <LoaderVisual />
    </div>
  );
}
