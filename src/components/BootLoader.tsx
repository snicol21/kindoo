'use client';

import { LoaderVisual } from '@/components/LoaderVisual';
import { useEffect, useState } from 'react';

export function BootLoader() {
  const [isVisible, setIsVisible] = useState(true);
  const [isRendered, setIsRendered] = useState(true);

  useEffect(() => {
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
  }, []);

  if (!isRendered) return null;

  return (
    <div
      aria-label="Loading application"
      className={`fixed inset-0 mt-17 -mb-17 z-100 grid place-items-center overflow-hidden bg-background px-4 text-foreground transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      style={{ zIndex: 9998 }}
    >
      <LoaderVisual />
    </div>
  );
}
