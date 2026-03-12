'use client';

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

    const fadeTimer = window.setTimeout(() => setIsVisible(false), 0);
    const removeTimer = window.setTimeout(() => {
      unlockScroll();
      setIsRendered(false);
    }, 220);

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
      className={`fixed inset-0 z-100 grid place-items-center bg-background text-foreground transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="relative grid h-24 w-24 place-items-center">
        <div className="absolute inset-1 animate-ping rounded-3xl border border-primary/35" />
        <div className="absolute inset-0 animate-spin rounded-3xl border-2 border-primary/20 border-t-primary" />
        <div className="absolute inset-2 animate-pulse rounded-3xl border border-primary/30" />
        <div className="grid h-14 w-14 animate-pulse animation-duration-[1.2s] place-items-center rounded-2xl border border-border bg-card shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/favicon.svg"
            alt="DigitalFob"
            width={28}
            height={28}
            loading="eager"
            decoding="sync"
            fetchPriority="high"
          />
        </div>
      </div>
    </div>
  );
}
