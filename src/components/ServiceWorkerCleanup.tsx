'use client';

import { useEffect } from 'react';

const CLEANUP_KEY = 'digitalfob-sw-cleanup-v1';

export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    try {
      if (window.localStorage.getItem(CLEANUP_KEY) === '1') {
        return;
      }
    } catch {
      // Continue even if storage is unavailable.
    }

    let cancelled = false;

    const run = async () => {
      let hadChanges = false;

      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        if (registrations.length > 0) {
          hadChanges = true;
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
      } catch {
        // Ignore cleanup errors.
      }

      try {
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          if (cacheKeys.length > 0) {
            hadChanges = true;
            await Promise.all(cacheKeys.map((key) => caches.delete(key)));
          }
        }
      } catch {
        // Ignore cleanup errors.
      }

      try {
        window.localStorage.setItem(CLEANUP_KEY, '1');
      } catch {
        // Ignore storage errors.
      }

      if (!cancelled && hadChanges) {
        window.location.reload();
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
