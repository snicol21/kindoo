'use client';

import { DropdownMenuItem } from '@/components/_ui/dropdown-menu';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function ResetOfflineCacheMenuItem() {
  const [pending, setPending] = useState(false);

  const handleReset = async () => {
    if (pending) return;

    setPending(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      toast.success('Offline cache reset. Reloading...');
      window.setTimeout(() => {
        window.location.reload();
      }, 150);
    } catch {
      toast.error('Failed to reset offline cache.');
      setPending(false);
    }
  };

  return (
    <DropdownMenuItem onClick={handleReset} disabled={pending} className="cursor-pointer">
      <RefreshCw className="h-4 w-4" />
      {pending ? 'Resetting cache...' : 'Reset offline cache'}
    </DropdownMenuItem>
  );
}
