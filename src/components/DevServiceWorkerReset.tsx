'use client';

import { useEffect } from 'react';

/**
 * Dev-only cache guard:
 * clears stale service workers + Cache Storage so localhost reflects current code.
 */
export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const run = async () => {
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {
        // Best-effort cleanup for local development.
      }

      if (!cancelled) {
        // No-op: effect is intentionally side-effect only.
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
