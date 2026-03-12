'use client';

import { LoaderVisual } from '@/components/LoaderVisual';
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
    <div
      className="fixed inset-0 mt-17 -mb-17 z-100 grid place-items-center overflow-hidden bg-background px-4 text-foreground"
      style={{ zIndex: 9998 }}
    >
      <LoaderVisual />
    </div>
  );
}
