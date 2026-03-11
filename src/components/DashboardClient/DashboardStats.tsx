'use client';

import { useEffect, useState } from 'react';
import { Card, CardDescription, CardHeader } from '@/components/_ui/card';
import type { EventWithCreator } from '@/actions/events';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { DashboardCounts, DotCalendarDay } from './types';
import { formatShortDate } from './utils';

type DashboardStatsProps = {
  activeBuildingKey: 'stake' | 'maples';
  dashboardCounts: DashboardCounts;
  totalCreators: number;
  breakdownEvents: EventWithCreator[];
  dotCalendarDays: DotCalendarDay[];
  todayYmd: string;
  weekdayLabels: readonly string[];
};

type MobileStatView = 'next-4-weeks' | 'event-totals' | 'by-ward';
type BreakdownMode = 'ward' | 'eventType' | 'creator';
const BREAKDOWN_MODES: BreakdownMode[] = ['ward', 'eventType', 'creator'];

const BREAKDOWN_LABELS: Record<BreakdownMode, string> = {
  ward: 'By Ward',
  eventType: 'By Event Type',
  creator: 'By Creator',
};
const AUTO_ROTATE_PAUSE_MS = 20_000;

export function DashboardStats({
  activeBuildingKey,
  dashboardCounts,
  totalCreators,
  breakdownEvents,
  dotCalendarDays,
  todayYmd,
  weekdayLabels,
}: DashboardStatsProps) {
  const [mobileView, setMobileView] = useState<MobileStatView>('event-totals');
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>('ward');
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(true);
  const [pauseAutoRotateUntil, setPauseAutoRotateUntil] = useState(0);
  const [calendarPage, setCalendarPage] = useState(0);
  const upcomingEvents =
    dashboardCounts.pendingLicense[activeBuildingKey] +
    dashboardCounts.activeLicense[activeBuildingKey] +
    dashboardCounts.upcoming[activeBuildingKey];
  const [displayUpcomingEvents, setDisplayUpcomingEvents] = useState(upcomingEvents);

  useEffect(() => {
    const target = upcomingEvents;
    const durationMs = 420;
    const startTime = performance.now();
    let frameId = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayUpcomingEvents(Math.round(target * eased));
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [upcomingEvents]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!autoRotateEnabled) {
        return;
      }

      if (Date.now() < pauseAutoRotateUntil) {
        return;
      }

      setBreakdownMode((prev) => {
        const currentIndex = BREAKDOWN_MODES.indexOf(prev);
        const nextIndex = (currentIndex + 1) % BREAKDOWN_MODES.length;
        return BREAKDOWN_MODES[nextIndex];
      });
    }, 7500);

    return () => window.clearInterval(intervalId);
  }, [autoRotateEnabled, pauseAutoRotateUntil]);

  const fullCalendarPages = Math.floor(dotCalendarDays.length / 28);
  const calendarPages = Math.max(1, fullCalendarPages);
  const maxCalendarPage = calendarPages - 1;
  const pageStartIndex = calendarPage * 28;
  const pageDays = dotCalendarDays.slice(pageStartIndex, pageStartIndex + 28);
  const startLabel = pageDays[0] ? formatShortDate(pageDays[0].ymd) : '-';
  const endLabel = pageDays[pageDays.length - 1] ? formatShortDate(pageDays[pageDays.length - 1].ymd) : '-';
  const next4WeeksLabel = `Next 4 weeks (${startLabel} - ${endLabel})`;
  const canGoPrev = calendarPage > 0;
  const nextPageStartIndex = (calendarPage + 1) * 28;
  const canGoNext =
    calendarPage < maxCalendarPage &&
    dotCalendarDays
      .slice(nextPageStartIndex, nextPageStartIndex + 28)
      .some((day) => day.count > 0);

  useEffect(() => {
    setCalendarPage((prev) => Math.min(prev, maxCalendarPage));
  }, [maxCalendarPage]);

  const renderEventTotals = () => {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Upcoming events
        </div>
        <div className="relative mt-1 inline-flex items-center justify-center px-2">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-full bg-emerald-500/20 blur-xl"
          />
          <span className="relative text-4xl font-bold leading-none text-emerald-600 dark:text-emerald-400">
            {displayUpcomingEvents}
          </span>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          Past events{' '}
          <span className="font-medium text-muted-foreground/90">
            {dashboardCounts.past[activeBuildingKey]}
          </span>
        </div>
      </div>
    );
  };

  const renderBreakdownCard = () => {
    const grouped = new Map<string, number>();

    for (const event of breakdownEvents) {
      const key =
        breakdownMode === 'ward'
          ? event.contactWard || 'Unknown'
          : breakdownMode === 'eventType'
            ? event.eventType
            : event.creatorName || event.creatorEmail || 'Unknown';
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    const rows = Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => (b.total === a.total ? a.label.localeCompare(b.label) : b.total - a.total));

    const maxVisible = breakdownMode === 'creator' ? 5 : 8;
    const visibleRows = rows.slice(0, maxVisible);
    const remainingRows = Math.max(0, rows.length - visibleRows.length);

    const displayRows =
      breakdownMode === 'creator' && remainingRows > 0
        ? [
            ...visibleRows,
            {
              label: 'Other creators',
              total: rows.slice(maxVisible).reduce((sum, row) => sum + row.total, 0),
            },
          ]
        : visibleRows;

    if (visibleRows.length === 0) {
      return <div className="text-xs text-muted-foreground">No upcoming events to break down yet.</div>;
    }

    const totalAcrossRows = displayRows.reduce((sum, row) => sum + row.total, 0);

    return (
      <div className="flex h-full w-full flex-col">
        <div className="flex flex-1 items-center">
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
            {displayRows.map((row) => (
              <div
                key={`${breakdownMode}-${row.label}`}
                className="rounded-md border border-border/60 bg-background/60 px-2 py-2"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="truncate text-muted-foreground" title={row.label}>{row.label}</span>
                  <span className="font-medium">{row.total}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${totalAcrossRows > 0 ? (row.total / totalAcrossRows) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {remainingRows > 0 && breakdownMode !== 'creator' && (
              <div className="rounded-md border border-dashed border-border/60 px-2 py-2 text-[11px] text-muted-foreground">
                +{remainingRows} more
              </div>
            )}
          </div>
        </div>
        <div className="pt-3 grid grid-cols-[1fr_auto_1fr] items-center">
          <span aria-hidden="true" />
          <div className="flex items-center justify-center gap-1.5">
            {BREAKDOWN_MODES.map((mode) => {
              const active = mode === breakdownMode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-label={`Show ${BREAKDOWN_LABELS[mode]}`}
                  className={`h-2 w-2 rounded-full transition-all ${
                    active ? 'bg-emerald-500 scale-105' : 'bg-muted-foreground/35 hover:bg-muted-foreground/55'
                  }`}
                  onClick={() => {
                    setBreakdownMode(mode);
                    setPauseAutoRotateUntil(Date.now() + AUTO_ROTATE_PAUSE_MS);
                  }}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-end">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              aria-label={autoRotateEnabled ? 'Pause breakdown auto-rotate' : 'Play breakdown auto-rotate'}
              title={autoRotateEnabled ? 'Pause auto-rotate' : 'Play auto-rotate'}
              onClick={() => setAutoRotateEnabled((prev) => !prev)}
            >
              {autoRotateEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderNext4Weeks = () => (
    <div className="w-full">
      <div className="relative">
        <button
          type="button"
          aria-label="Previous 4 weeks"
          className={`absolute -left-6 top-[calc(50%-2px)] inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/80 transition-colors ${
            canGoPrev ? 'hover:text-foreground' : 'pointer-events-none opacity-30'
          }`}
          onClick={() => setCalendarPage((prev) => Math.max(0, prev - 1))}
          disabled={!canGoPrev}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next 4 weeks"
          className={`absolute -right-6 top-[calc(50%-2px)] inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/80 transition-colors ${
            canGoNext ? 'hover:text-foreground' : 'pointer-events-none opacity-30'
          }`}
          onClick={() => setCalendarPage((prev) => Math.min(maxCalendarPage, prev + 1))}
          disabled={!canGoNext}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
          {weekdayLabels.map((label, index) => (
            <div key={`${label}-${index}`} className="w-4 text-center leading-none">
              {label}
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-2">
          {[0, 1, 2, 3].map((weekIndex) => {
            const baseIndex = calendarPage * 28;
            const week = dotCalendarDays.slice(baseIndex + weekIndex * 7, baseIndex + weekIndex * 7 + 7);
            return (
              <div key={`week-${weekIndex}`} className="flex w-full items-center justify-between">
                {week.map((day) => {
                  const isToday = day.ymd === todayYmd;
                  const dotClass =
                    day.count === 0 ? 'bg-muted-foreground/30' : 'bg-emerald-500';
                  const title = `${formatShortDate(day.ymd)}${
                    isToday ? ' (today)' : ''
                  } - ${day.count} event${day.count === 1 ? '' : 's'}${
                    day.count === 0 ? ' (no events)' : ''
                  }`;

                  return (
                    <div key={day.ymd} title={title} className="flex h-4 w-4 items-center justify-center">
                      <span
                        className={`inline-flex h-3 w-3 items-center justify-center rounded-full ${
                          isToday
                            ? 'shadow-[0_0_6px_2px_rgba(0,0,0,0.9)] dark:shadow-[0_0_6px_2px_rgba(255,255,255,0.9)]'
                            : ''
                        }`}
                      >
                        <span className={`inline-block h-3 w-3 rounded-full ${dotClass}`} />
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:hidden">
        <Card className="h-full">
          <CardHeader className="flex h-full flex-col gap-3 py-3">
            <div className="inline-flex w-full rounded-md border border-border/60 bg-background/80 p-1">
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mobileView === 'by-ward'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileView('by-ward')}
              >
                {BREAKDOWN_LABELS[breakdownMode]}
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mobileView === 'event-totals'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileView('event-totals')}
              >
                Event Totals
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mobileView === 'next-4-weeks'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileView('next-4-weeks')}
              >
                Next 4 Weeks
              </button>
            </div>
            <div className="border-t border-border/60" />
            <div className="flex min-h-[130px] flex-col">
              {mobileView === 'next-4-weeks' ? (
                <div className="flex flex-1 items-center">{renderNext4Weeks()}</div>
              ) : mobileView === 'event-totals' ? (
                <div className="flex-1">{renderEventTotals()}</div>
              ) : (
                <div className="flex flex-1">{renderBreakdownCard()}</div>
              )}
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="hidden grid-cols-1 gap-4 lg:grid lg:grid-cols-3">
        <Card className="h-full">
          <CardHeader className="h-full py-3 flex flex-col">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {BREAKDOWN_LABELS[breakdownMode]}
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className="flex flex-1">{renderBreakdownCard()}</div>
          </CardHeader>
        </Card>

        <Card className="h-full">
          <CardHeader className="h-full py-3 flex flex-col">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Events
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className="flex flex-1 items-center">{renderEventTotals()}</div>
          </CardHeader>
        </Card>

        <Card className="h-full">
          <CardHeader className="h-full py-3 flex flex-col">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {next4WeeksLabel}
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className="mt-2 flex flex-1 items-center">{renderNext4Weeks()}</div>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
