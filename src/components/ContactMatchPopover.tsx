'use client';

import { useEffect, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { Lightbulb, X } from 'lucide-react';
import type { Ward } from '@/schema/schema';

export type ContactMatch = {
  id: string;
  name: string;
  ward: Ward;
  email: string | null;
  phone: string | null;
};

export const handleContactMatchKeyDown = (options: {
  open: boolean;
  match: ContactMatch | null;
  onUseMatch: (contact: ContactMatch) => void;
  onTabFocus?: () => void;
}) => {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (!options.open || !options.match) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      options.onUseMatch(options.match);
      return;
    }

    if (event.key === 'Tab' && options.onTabFocus) {
      event.preventDefault();
      options.onTabFocus();
    }
  };
};

type ContactMatchPopoverProps = {
  open: boolean;
  searching: boolean;
  matchCandidate: ContactMatch | null;
  suggestedMatch?: ContactMatch | null;
  suggestedMatches?: ContactMatch[];
  suggestedCount?: number;
  formatPhone?: (value?: string | null) => string;
  onUseMatch: (contact: ContactMatch) => void;
  onDismiss: (contactId: string) => void;
  focusRef?: RefObject<HTMLDivElement | null>;
  onBlur?: () => void;
  onTabNext?: () => void;
  onTabPrev?: () => void;
};

const OPEN_DELAY_MS = 120;
const EXIT_DELAY_MS = 150;

export function ContactMatchPopover({
  open,
  searching,
  matchCandidate,
  suggestedMatch = null,
  suggestedMatches = [],
  suggestedCount = 0,
  formatPhone,
  onUseMatch,
  onDismiss,
  focusRef,
  onBlur,
  onTabNext,
  onTabPrev,
}: ContactMatchPopoverProps) {
  const [shouldRender, setShouldRender] = useState(open);
  const [isOpen, setIsOpen] = useState(open);

  useEffect(() => {
    let timer: number | undefined;

    if (open) {
      setShouldRender(true);
      setIsOpen(false);
      timer = window.setTimeout(() => setIsOpen(true), OPEN_DELAY_MS);
    } else {
      setIsOpen(false);
      timer = window.setTimeout(() => setShouldRender(false), EXIT_DELAY_MS);
    }

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [open]);

  const suggestionList = suggestedMatches.length
    ? suggestedMatches
    : suggestedMatch
      ? [suggestedMatch]
      : [];
  const resolvedMatches = matchCandidate ? [matchCandidate] : suggestionList;
  const visibleSuggestions = resolvedMatches.slice(0, 4);
  const effectiveMatch = visibleSuggestions[0] ?? null;
  const countLabel = suggestedCount > 0 ? suggestedCount : resolvedMatches.length;
  const isSingleMatch = visibleSuggestions.length === 1;
  const matchLabel = matchCandidate
    ? 'Matching contact'
    : resolvedMatches.length
      ? 'Possible match'
      : 'Matching contact';

  const ariaLabel = effectiveMatch
    ? !isSingleMatch
      ? `Possible matches (${countLabel} contacts), select a contact`
      : resolvedMatches.length > 0 && countLabel > 1
        ? `Possible match (${countLabel} contacts), press Enter to use`
        : 'Matched contact, press Enter to use'
    : 'Searching contacts';

  if (!shouldRender || !effectiveMatch) return null;

  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role={effectiveMatch && isSingleMatch ? 'button' : undefined}
      aria-label={ariaLabel}
      className={`absolute right-1 top-1/2 z-10 w-56 -translate-y-1/2 rounded-md border border-blue-200 bg-linear-to-br from-blue-50/95 via-blue-50/95 to-blue-200/60 p-2 text-xs text-blue-950 shadow-lg transition duration-150 ease-out dark:border-blue-900/80 dark:from-blue-950/95 dark:via-blue-950/95 dark:to-blue-900/60 dark:text-blue-100 ${
        isOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
      } ${
        effectiveMatch && isSingleMatch
          ? 'cursor-pointer hover:-translate-y-[52%] hover:border-blue-300 hover:bg-blue-100/95 hover:shadow-xl dark:hover:border-blue-700 dark:hover:bg-blue-900/70'
          : ''
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onBlur={(event) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (nextFocused && event.currentTarget.contains(nextFocused)) {
          return;
        }
        onBlur?.();
      }}
      onClick={() => {
        if (effectiveMatch && isSingleMatch) onUseMatch(effectiveMatch);
      }}
      onKeyDown={(event) => {
        if (!effectiveMatch) return;

        const fromOption =
          event.target instanceof HTMLElement &&
          event.target.closest('button[data-contact-option="true"]') !== null;

        if ((event.key === 'Tab' || event.key === 'Enter' || event.key === ' ') && fromOption) {
          return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (isSingleMatch) {
            onUseMatch(effectiveMatch);
          } else {
            const firstOption = event.currentTarget.querySelector<HTMLButtonElement>(
              'button[data-contact-option="true"]'
            );
            firstOption?.focus();
          }
        }
        if (event.key === 'Tab') {
          if (event.shiftKey && onTabPrev) {
            event.preventDefault();
            onTabPrev();
          } else if (!event.shiftKey && onTabNext) {
            event.preventDefault();
            onTabNext();
          }
        }
      }}
    >
      {effectiveMatch && isSingleMatch && (
        <button
          type="button"
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-blue-700 hover:bg-blue-200/70 hover:text-blue-900 dark:text-blue-200 dark:hover:bg-blue-900/50 dark:hover:text-blue-50"
          aria-label="Dismiss match"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(effectiveMatch.id);
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="flex min-w-0 items-start gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white dark:bg-blue-500">
          <Lightbulb className="h-2.5 w-2.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className={`flex items-center gap-1.5 font-medium ${isSingleMatch ? 'pr-7' : ''}`}>
            <span className={searching ? 'animate-pulse' : ''}>{matchLabel}</span>
            {countLabel > 1 && <span>({countLabel})</span>}
            {searching && (
              <span className="h-2 w-2 animate-spin rounded-full border border-blue-600 border-t-transparent dark:border-blue-300 dark:border-t-transparent" />
            )}
          </div>
          <div className="mt-1 space-y-0.5 pr-0.5">
            {visibleSuggestions.map((contact, index) => {
              const phoneLabel = contact.phone
                ? formatPhone
                  ? formatPhone(contact.phone)
                  : contact.phone
                : 'No phone';
              return (
                <button
                  key={contact.id}
                  type="button"
                  data-contact-option="true"
                  className={`w-full min-w-0 rounded-sm px-1.5 py-1 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent hover:bg-blue-100/70 dark:hover:bg-blue-900/55 ${
                    index > 0 ? 'border-t border-blue-200/60 pt-1.5 dark:border-blue-800/60' : ''
                  }`}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key !== 'Tab') return;

                    if (event.shiftKey && index === 0 && onTabPrev) {
                      event.preventDefault();
                      onTabPrev();
                      return;
                    }

                    if (!event.shiftKey && index === visibleSuggestions.length - 1 && onTabNext) {
                      event.preventDefault();
                      onTabNext();
                    }
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUseMatch(contact);
                  }}
                >
                  <div className="font-medium text-blue-950 dark:text-blue-100">{contact.name}</div>
                  <div className="flex min-w-0 items-center gap-1 text-[10px] text-blue-900/85 dark:text-blue-100/85">
                    <span>{contact.ward}</span>
                    <span className="shrink-0">•</span>
                    <span className="shrink-0 whitespace-nowrap">{phoneLabel}</span>
                  </div>
                  {contact.email && (
                    <div className="break-all text-[10px] text-blue-900/70 dark:text-blue-100/70">
                      {contact.email}
                    </div>
                  )}
                </button>
              );
            })}
            {resolvedMatches.length > visibleSuggestions.length && (
              <div className="px-1 text-[10px] text-blue-900/70 dark:text-blue-100/70">
                Showing {visibleSuggestions.length} of {resolvedMatches.length}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
