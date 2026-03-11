'use client';

import { Button } from '@/components/_ui/button';
import { useEffect, useMemo, useState } from 'react';

type BannerMode = 'none' | 'prompt' | 'ios';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'digitalfob-install-banner-dismissed';

function isStandaloneMode() {
  const mediaStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return mediaStandalone || iosStandalone;
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIOSDevice =
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opr\//i.test(ua);
  return isIOSDevice && isSafari;
}

export function PwaInstallBanner() {
  const [mode, setMode] = useState<BannerMode>('none');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.localStorage.getItem(DISMISS_KEY) === '1' || isStandaloneMode()) {
      return;
    }

    if (isIosSafari()) {
      setMode('ios');
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setMode('prompt');
    };

    const onAppInstalled = () => {
      setMode('none');
      setDeferredPrompt(null);
      window.localStorage.setItem(DISMISS_KEY, '1');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const description = useMemo(() => {
    if (mode === 'ios') {
      return 'Install DigitalFob from Safari: tap Share, then Add to Home Screen.';
    }
    if (mode === 'prompt') {
      return 'Install DigitalFob for faster launch and an app-like experience.';
    }
    return '';
  }, [mode]);

  if (mode === 'none') {
    return null;
  }

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, '1');
    setMode('none');
  };

  const install = async () => {
    if (!deferredPrompt) {
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      window.localStorage.setItem(DISMISS_KEY, '1');
      setMode('none');
      setDeferredPrompt(null);
      return;
    }
    setDeferredPrompt(null);
    setMode('none');
  };

  return (
    <div className="fixed inset-x-3 bottom-3 z-60 md:inset-x-auto md:right-4 md:bottom-4 md:w-100">
      <div className="rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/80">
        <p className="text-sm font-medium">Install DigitalFob</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
          {mode === 'prompt' && (
            <Button size="sm" onClick={install}>
              Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
