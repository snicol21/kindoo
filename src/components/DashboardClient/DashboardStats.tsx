'use client';

import type { EventWithCreator } from '@/actions/events';
import { Card, CardDescription, CardHeader } from '@/components/_ui/card';
import type { UserRole } from '@/schema/schema';
import { WARDS } from '@/schema/schema';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DashboardCounts, DotCalendarDay } from './types';
import { formatShortDate } from './utils';

type DashboardStatsProps = {
  activeBuildingKey: 'stake' | 'maples';
  dashboardCounts: DashboardCounts;
  currentUserRole: UserRole;
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
const STATS_CONTENT_HEIGHT_CLASS = 'h-[150px] lg:h-[125px]';

function parsePreviewNumber(value: string | null, fallback: number, min: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function DashboardStats({
  activeBuildingKey,
  dashboardCounts,
  currentUserRole,
  breakdownEvents,
  dotCalendarDays,
  todayYmd,
  weekdayLabels,
}: DashboardStatsProps) {
  const searchParams = useSearchParams();
  const [mobileView, setMobileView] = useState<MobileStatView>('event-totals');
  const availableBreakdownModes = useMemo<BreakdownMode[]>(() => {
    const isWardScopedUser = currentUserRole === 'ward_manager' || currentUserRole === 'ward_user';
    return isWardScopedUser ? ['eventType', 'creator'] : BREAKDOWN_MODES;
  }, [currentUserRole]);
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>(availableBreakdownModes[0]);
  const [autoRotateEnabled, setAutoRotateEnabled] = useState(false);
  const [pauseAutoRotateUntil, setPauseAutoRotateUntil] = useState(0);
  const [calendarPage, setCalendarPage] = useState(0);
  const breakdownTouchStartX = useRef<number | null>(null);
  const breakdownTouchStartY = useRef<number | null>(null);
  const calendarTouchStartX = useRef<number | null>(null);
  const calendarTouchStartY = useRef<number | null>(null);
  const breakdownPreviewEnabled = searchParams.get('breakdownPreview') === '1';
  const previewCreatorCount = parsePreviewNumber(searchParams.get('previewCreators'), 50, 1, 200);
  const previewWardCount = parsePreviewNumber(
    searchParams.get('previewWards'),
    WARDS.length,
    1,
    WARDS.length
  );
  const breakdownEventsForDisplay = useMemo(() => {
    if (!breakdownPreviewEnabled) {
      return breakdownEvents;
    }

    const fallbackEvent: EventWithCreator = {
      id: 'preview-seed',
      building: activeBuildingKey === 'stake' ? 'Stake Center' : 'Maples Building',
      eventType: 'Ward',
      eventDate: '2099-01-01',
      startTime: '09:00',
      endTime: '10:00',
      contactId: 'preview-contact',
      description: 'Preview event',
      kindooLicenseCreated: false,
      userId: 'preview-user',
      createdAt: new Date(),
      creatorName: 'Preview Creator 1',
      creatorEmail: 'creator1@preview.local',
      creatorRole: 'ward_user',
      contactName: 'Preview Contact',
      contactWard: WARDS[0],
      contactEmail: null,
      contactPhone: null,
    };

    const sourcePool = breakdownEvents.length > 0 ? breakdownEvents : [fallbackEvent];
    const wardPool = WARDS.slice(0, previewWardCount);
    const previewRows = Math.max(sourcePool.length, previewCreatorCount * 2);

    return Array.from({ length: previewRows }, (_, index) => {
      const source = sourcePool[index % sourcePool.length];
      const creatorIndex = (index % previewCreatorCount) + 1;
      const ward = wardPool[index % wardPool.length];

      return {
        ...source,
        id: `preview-${index + 1}`,
        creatorName: `Preview Creator ${creatorIndex}`,
        creatorEmail: `creator${creatorIndex}@preview.local`,
        contactWard: ward,
      };
    });
  }, [
    activeBuildingKey,
    breakdownEvents,
    breakdownPreviewEnabled,
    previewCreatorCount,
    previewWardCount,
  ]);
  const upcomingEvents =
    dashboardCounts.pendingLicense[activeBuildingKey] +
    dashboardCounts.activeLicense[activeBuildingKey] +
    dashboardCounts.upcoming[activeBuildingKey];
  const [displayUpcomingEvents, setDisplayUpcomingEvents] = useState(upcomingEvents);

  useEffect(() => {
    if (!availableBreakdownModes.includes(breakdownMode)) {
      setBreakdownMode(availableBreakdownModes[0]);
    }
  }, [availableBreakdownModes, breakdownMode]);

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
        const currentIndex = availableBreakdownModes.indexOf(prev);
        const nextIndex = (currentIndex + 1) % availableBreakdownModes.length;
        return availableBreakdownModes[nextIndex];
      });
    }, 7500);

    return () => window.clearInterval(intervalId);
  }, [autoRotateEnabled, pauseAutoRotateUntil, availableBreakdownModes]);

  const fullCalendarPages = Math.floor(dotCalendarDays.length / 28);
  const calendarPages = Math.max(1, fullCalendarPages);
  const maxCalendarPage = calendarPages - 1;
  const pageStartIndex = calendarPage * 28;
  const pageDays = dotCalendarDays.slice(pageStartIndex, pageStartIndex + 28);
  const startLabel = pageDays[0] ? formatShortDate(pageDays[0].ymd) : '-';
  const endLabel = pageDays[pageDays.length - 1]
    ? formatShortDate(pageDays[pageDays.length - 1].ymd)
    : '-';
  const next4WeeksLabel = `Next 4 weeks (${startLabel} - ${endLabel})`;
  const canGoPrev = calendarPage > 0;
  const nextPageStartIndex = (calendarPage + 1) * 28;
  const canGoNext =
    calendarPage < maxCalendarPage &&
    dotCalendarDays.slice(nextPageStartIndex, nextPageStartIndex + 28).some((day) => day.count > 0);

  useEffect(() => {
    setCalendarPage((prev) => Math.min(prev, maxCalendarPage));
  }, [maxCalendarPage]);

  const handleCalendarTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const firstTouch = event.touches[0];
    if (!firstTouch) {
      return;
    }
    calendarTouchStartX.current = firstTouch.clientX;
    calendarTouchStartY.current = firstTouch.clientY;
  };

  const handleCalendarTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = calendarTouchStartX.current;
    const startY = calendarTouchStartY.current;
    calendarTouchStartX.current = null;
    calendarTouchStartY.current = null;

    if (startX === null || startY === null) {
      return;
    }

    const endTouch = event.changedTouches[0];
    if (!endTouch) {
      return;
    }

    const deltaX = endTouch.clientX - startX;
    const deltaY = endTouch.clientY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX < 28 || absX <= absY * 1.2) {
      return;
    }

    if (deltaX < 0 && canGoNext) {
      setCalendarPage((prev) => Math.min(maxCalendarPage, prev + 1));
      return;
    }

    if (deltaX > 0 && canGoPrev) {
      setCalendarPage((prev) => Math.max(0, prev - 1));
    }
  };

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
    const canCycleBreakdown = availableBreakdownModes.length > 1;
    const cycleBreakdown = (step: -1 | 1) => {
      if (!canCycleBreakdown) {
        return;
      }
      setPauseAutoRotateUntil(Date.now() + AUTO_ROTATE_PAUSE_MS);
      setBreakdownMode((prev) => {
        const currentIndex = availableBreakdownModes.indexOf(prev);
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex =
          (safeIndex + step + availableBreakdownModes.length) % availableBreakdownModes.length;
        return availableBreakdownModes[nextIndex];
      });
    };

    const handleBreakdownTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
      const firstTouch = event.touches[0];
      if (!firstTouch) {
        return;
      }
      breakdownTouchStartX.current = firstTouch.clientX;
      breakdownTouchStartY.current = firstTouch.clientY;
    };

    const handleBreakdownTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
      const startX = breakdownTouchStartX.current;
      const startY = breakdownTouchStartY.current;
      breakdownTouchStartX.current = null;
      breakdownTouchStartY.current = null;

      if (startX === null || startY === null || !canCycleBreakdown) {
        return;
      }

      const endTouch = event.changedTouches[0];
      if (!endTouch) {
        return;
      }

      const deltaX = endTouch.clientX - startX;
      const deltaY = endTouch.clientY - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (absX < 28 || absX <= absY * 1.2) {
        return;
      }

      if (deltaX < 0) {
        cycleBreakdown(1);
      } else {
        cycleBreakdown(-1);
      }
    };

    const grouped = new Map<string, number>();

    for (const event of breakdownEventsForDisplay) {
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

    const maxVisible = 9;
    const hasOverflow = rows.length > maxVisible;

    const visibleRows = hasOverflow ? rows.slice(0, maxVisible - 1) : rows.slice(0, maxVisible);
    const remainingRows = Math.max(0, rows.length - visibleRows.length);

    const displayRows =
      breakdownMode === 'creator' && hasOverflow
        ? [
            ...visibleRows,
            {
              label: 'Other creators',
              total: rows.slice(maxVisible - 1).reduce((sum, row) => sum + row.total, 0),
            },
          ]
        : visibleRows;

    if (visibleRows.length === 0) {
      return (
        <div className="text-xs text-muted-foreground">No upcoming events to break down yet.</div>
      );
    }

    const totalAcrossRows = displayRows.reduce((sum, row) => sum + row.total, 0);
    const displayCount = displayRows.length;
    const gridColumnsClass = displayCount <= 4 ? 'grid-cols-2' : 'grid-cols-3';

    return (
      <div
        className="relative grid h-full min-h-0 w-full grid-rows-[1fr_auto] gap-0.5 lg:grid-rows-1"
        onTouchStart={handleBreakdownTouchStart}
        onTouchEnd={handleBreakdownTouchEnd}
      >
        <div className="min-h-0 overflow-y-auto pr-1 lg:overflow-hidden lg:pb-0">
          <div
            className={`grid min-h-full w-full auto-rows-min content-center ${gridColumnsClass} gap-1.5`}
          >
            {displayRows.map((row) => (
              <div
                key={`${breakdownMode}-${row.label}`}
                className="rounded-md border border-border/60 bg-background/60 px-2 py-1.5"
              >
                <div className="flex items-center justify-between text-[10px] leading-tight">
                  <span className="truncate text-muted-foreground" title={row.label}>
                    {row.label}
                  </span>
                  <span className="font-medium">{row.total}</span>
                </div>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted/70">
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
              <div className="rounded-md border border-dashed border-border/60 px-2 py-1.5 text-[10px] leading-tight text-muted-foreground">
                +{remainingRows} more
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center pb-0.5 lg:absolute lg:inset-x-0 lg:-bottom-4 lg:pb-0">
          <span aria-hidden="true" />
          <div className="flex items-center justify-center gap-1.5">
            {availableBreakdownModes.map((mode) => {
              const active = mode === breakdownMode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-label={`Show ${BREAKDOWN_LABELS[mode]}`}
                  className={`h-2 w-2 rounded-full transition-all ${
                    active
                      ? 'bg-emerald-500 scale-105'
                      : 'bg-muted-foreground/35 hover:bg-muted-foreground/55'
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
              aria-label={
                autoRotateEnabled ? 'Pause breakdown auto-rotate' : 'Play breakdown auto-rotate'
              }
              title={autoRotateEnabled ? 'Pause auto-rotate' : 'Play auto-rotate'}
              onClick={() => setAutoRotateEnabled((prev) => !prev)}
            >
              {autoRotateEnabled ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderNext4Weeks = () => (
    <div
      className="w-full"
      onTouchStart={handleCalendarTouchStart}
      onTouchEnd={handleCalendarTouchEnd}
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Previous 4 weeks"
          className={`absolute -left-7 top-[calc(50%-2px)] z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/80 transition-colors md:-left-6 md:h-6 md:w-6 md:rounded ${
            canGoPrev ? 'hover:text-foreground' : 'pointer-events-none opacity-30'
          }`}
          onClick={() => setCalendarPage((prev) => Math.max(0, prev - 1))}
          disabled={!canGoPrev}
        >
          <ChevronLeft className="h-4 w-4 md:h-3.5 md:w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next 4 weeks"
          className={`absolute -right-7 top-[calc(50%-2px)] z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/80 transition-colors md:-right-6 md:h-6 md:w-6 md:rounded ${
            canGoNext ? 'hover:text-foreground' : 'pointer-events-none opacity-30'
          }`}
          onClick={() => setCalendarPage((prev) => Math.min(maxCalendarPage, prev + 1))}
          disabled={!canGoNext}
        >
          <ChevronRight className="h-4 w-4 md:h-3.5 md:w-3.5" />
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
            const week = dotCalendarDays.slice(
              baseIndex + weekIndex * 7,
              baseIndex + weekIndex * 7 + 7
            );
            return (
              <div key={`week-${weekIndex}`} className="flex w-full items-center justify-between">
                {week.map((day) => {
                  const isToday = day.ymd === todayYmd;
                  const dotClass = day.count === 0 ? 'bg-muted-foreground/30' : 'bg-emerald-500';
                  const title = `${formatShortDate(day.ymd)}${
                    isToday ? ' (today)' : ''
                  } - ${day.count} event${day.count === 1 ? '' : 's'}${
                    day.count === 0 ? ' (no events)' : ''
                  }`;

                  return (
                    <div
                      key={day.ymd}
                      title={title}
                      className="flex h-4 w-4 items-center justify-center"
                    >
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
        <Card className="overflow-hidden">
          <CardHeader className="flex h-full flex-col pt-3 pb-1">
            <div className="mb-3 inline-flex w-full rounded-md border border-border/60 bg-background/80 p-1">
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
            <div className={`${STATS_CONTENT_HEIGHT_CLASS} flex min-h-0 flex-col`}>
              {mobileView === 'next-4-weeks' ? (
                <div className="flex flex-1 items-center">{renderNext4Weeks()}</div>
              ) : mobileView === 'event-totals' ? (
                <div className="flex-1">{renderEventTotals()}</div>
              ) : (
                <div className="flex min-h-0 flex-1">{renderBreakdownCard()}</div>
              )}
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="hidden grid-cols-1 gap-4 lg:grid lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader className="flex h-full min-h-0 flex-col pt-3 pb-1">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {BREAKDOWN_LABELS[breakdownMode]}
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className={`${STATS_CONTENT_HEIGHT_CLASS} flex min-h-0`}>
              {renderBreakdownCard()}
            </div>
          </CardHeader>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex h-full min-h-0 flex-col py-3">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Events
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className={`${STATS_CONTENT_HEIGHT_CLASS} flex items-center`}>
              {renderEventTotals()}
            </div>
          </CardHeader>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="flex h-full min-h-0 flex-col py-3">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {next4WeeksLabel}
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className={`${STATS_CONTENT_HEIGHT_CLASS} mt-2 flex items-center`}>
              {renderNext4Weeks()}
            </div>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
