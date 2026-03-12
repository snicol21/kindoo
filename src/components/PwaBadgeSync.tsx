'use client';

import { useEffect } from 'react';

type PwaBadgeSyncProps = {
  count: number;
};

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
  standalone?: boolean;
};

function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false;

  try {
    const displayModeStandalone =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;
    const iOSStandalone = (window.navigator as BadgeNavigator).standalone === true;
    return displayModeStandalone || iOSStandalone;
  } catch {
    return false;
  }
}

export function PwaBadgeSync({ count }: PwaBadgeSyncProps) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.isSecureContext) return;

    try {
      const nav = window.navigator as BadgeNavigator;
      const supportsBadging =
        typeof nav.setAppBadge === 'function' || typeof nav.clearAppBadge === 'function';

      if (!supportsBadging) return;
      if (!isStandaloneDisplayMode()) return;

      const nextCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;

      const sync = async () => {
        try {
          if (nextCount > 0 && typeof nav.setAppBadge === 'function') {
            await nav.setAppBadge(Math.min(nextCount, 99));
            return;
          }

          if (typeof nav.clearAppBadge === 'function') {
            await nav.clearAppBadge();
          }
        } catch {
          // Ignore unsupported/permission errors and keep app functional.
        }
      };

      // Let first paint complete before touching optional PWA APIs.
      const idleCallback = (window as Window & { requestIdleCallback?: (cb: () => void) => number })
        .requestIdleCallback;
      if (typeof idleCallback === 'function') {
        idleCallback(() => {
          void sync();
        });
      } else {
        window.setTimeout(() => {
          void sync();
        }, 0);
      }
    } catch {
      // Never allow badging logic to break app rendering.
    }
  }, [count]);

  return null;
}
