'use client';

import { LoaderVisual } from '@/components/LoaderVisual';

// Rendered by Next.js Suspense while async server components are resolving.
// z:49 keeps it below the navbar (z:50) so the navbar is always visible.
// pt-16 offsets the grid content area past the navbar so place-items-center
// lands the spinner at the true centre of the below-navbar viewport.
export default function Loading() {
  return (
    <div
      className="fixed inset-0 pt-16 grid place-items-center overflow-hidden bg-background px-4 text-foreground"
      style={{ zIndex: 49 }}
    >
      <LoaderVisual />
    </div>
  );
}
