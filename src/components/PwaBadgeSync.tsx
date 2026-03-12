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
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ((window.navigator as BadgeNavigator).standalone ?? false)
  );
}

export function PwaBadgeSync({ count }: PwaBadgeSyncProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

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

    void sync();
  }, [count]);

  return null;
}
