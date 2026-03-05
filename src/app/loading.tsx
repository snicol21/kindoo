import { CalendarDays } from 'lucide-react';

export default function Loading() {
  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden bg-background px-4 text-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(45rem 28rem at 50% 40%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 65%)',
        }}
      />

      <div className="relative" aria-label="Loading">
        <div className="relative grid h-24 w-24 place-items-center">
          <div className="absolute inset-1 animate-ping rounded-full border border-primary/35" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          <div className="absolute inset-2 animate-pulse rounded-full border border-primary/30" />
          <div className="grid h-12 w-12 animate-pulse animation-duration-[1.2s] place-items-center rounded-2xl border border-border bg-card shadow-sm">
            <CalendarDays className="h-6 w-6 text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}
