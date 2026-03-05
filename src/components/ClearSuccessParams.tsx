'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface ClearSuccessParamsProps {
  keys: string[];
}

export function ClearSuccessParams({ keys }: ClearSuccessParamsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    let changed = false;

    for (const key of keys) {
      if (next.has(key)) {
        next.delete(key);
        changed = true;
      }
    }

    if (!changed) return;

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [keys, pathname, router, searchParams]);

  return null;
}
