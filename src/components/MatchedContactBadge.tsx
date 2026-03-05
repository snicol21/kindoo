type MatchedContactBadgeProps = {
  variant?: 'overlay' | 'inline' | 'select';
  as?: 'span' | 'div';
  update?: boolean;
};

export function MatchedContactBadge({
  variant = 'overlay',
  as = 'span',
  update = false,
}: MatchedContactBadgeProps) {
  const baseClasses = update
    ? 'inline-flex w-max max-w-none shrink-0 flex-nowrap select-none items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50/90 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/70 dark:text-amber-100'
    : 'inline-flex w-max max-w-none shrink-0 flex-nowrap select-none items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50/90 px-2 py-0.5 text-[11px] font-medium leading-none text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/70 dark:text-emerald-100';
  const layoutClasses =
    variant === 'overlay'
      ? 'absolute right-2 top-1/2 -translate-y-1/2'
      : variant === 'select'
        ? 'absolute inset-y-0 right-11 my-auto h-5 gap-0.5 px-1.5 text-[10px]'
        : 'text-[10px]';

  const Element = as;
  return (
    <Element
      className={`${baseClasses} ${layoutClasses}`}
      aria-label={update ? 'This field will update the linked contact' : 'Linked contact'}
      title={update ? 'This field will update the linked contact' : undefined}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      Linked{update ? '*' : ''}
    </Element>
  );
}
