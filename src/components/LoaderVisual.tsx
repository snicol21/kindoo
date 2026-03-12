type LoaderVisualProps = {
  ariaLabel?: string;
};

export function LoaderVisual({ ariaLabel = 'Loading application' }: LoaderVisualProps) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(45rem 28rem at 50% 40%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 65%)',
        }}
      />

      <div className="relative" aria-label={ariaLabel}>
        <div className="relative grid h-24 w-24 place-items-center">
          <div className="absolute inset-1 animate-ping rounded-3xl border border-primary/35" />
          <div className="absolute inset-0 animate-spin rounded-3xl border-2 border-primary/20 border-t-primary" />
          <div className="absolute inset-2 animate-pulse rounded-3xl border border-primary/30" />
          <div className="grid h-14 w-14 animate-pulse animation-duration-[1.2s] place-items-center rounded-2xl border border-border bg-card shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/favicon.svg"
              alt="DigitalFob"
              width={28}
              height={28}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
            />
          </div>
        </div>
      </div>
    </>
  );
}
