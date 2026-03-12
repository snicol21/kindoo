'use client';

import { useEffect } from 'react';

export default function Loading() {
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-90 grid place-items-center overflow-hidden bg-background px-4 text-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(45rem 28rem at 50% 40%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 65%)',
        }}
      />

      <div className="relative" aria-label="Loading">
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
    </div>
  );
}
