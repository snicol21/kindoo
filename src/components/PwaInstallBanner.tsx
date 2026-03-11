'use client';

import { Button } from '@/components/_ui/button';
import { ArrowDown, Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    <div className="fixed inset-x-0 z-60" style={{ top: 'auto', bottom: 0, left: 0, right: 0 }}>
      <div
        className="relative border-t border-primary/80 bg-primary px-4 text-primary-foreground shadow-2xl"
        style={{
          paddingTop: '2.75rem',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 3.5rem)',
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-200">
                <Lightbulb className="h-3.5 w-3.5" />
              </span>
              <p className="text-sm font-semibold">Install DigitalFob</p>
            </div>

            {mode === 'ios' && (
              <p className="mt-1 text-xs leading-relaxed text-primary-foreground/90">
                Add to Home Screen on iPhone: tap{' '}
                <span className="font-semibold text-primary-foreground">Share</span>, then scroll
                down to{' '}
                <span className="font-semibold text-primary-foreground">Add to Home Screen</span>.
              </p>
            )}

            {mode === 'prompt' && (
              <p className="mt-1 text-xs leading-relaxed text-primary-foreground/90">
                Install this app for faster access, right from your home screen.
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-primary-foreground/35 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              onClick={dismiss}
            >
              Not now
            </Button>
            {mode === 'prompt' && (
              <Button
                size="sm"
                variant="secondary"
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90"
                onClick={install}
              >
                Install
              </Button>
            )}
          </div>
        </div>

        {mode === 'ios' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
            <ArrowDown
              className="h-8 w-8 animate-bounce animation-duration-[1.1s] text-yellow-200 drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)] motion-reduce:animate-none"
              aria-hidden="true"
            />
          </div>
        )}
      </div>
    </div>
  );
}
