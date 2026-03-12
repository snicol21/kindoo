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
        <div className="relative size-24 flex items-center justify-center">
          {/* Outer faint pulsing ring */}
          <div className="absolute inset-0 animate-ping rounded-full border-4 border-primary/20" />

          {/* Main spinning ring – classic spinner style */}
          <div
            className="
              absolute inset-0
              animate-spin
              rounded-full
              border-4 border-primary/30
              border-t-primary
            "
          />

          {/* Optional inner faint ring (adds depth) */}
          <div className="absolute inset-2 animate-pulse rounded-full border border-primary/25" />

          {/* Center logo container – now circular */}
          <div
            className="
              size-14
              animate-pulse animation-duration-[1.2s]
              rounded-full
              border border-border
              bg-card
              shadow-sm
              flex items-center justify-center
            "
          >
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
