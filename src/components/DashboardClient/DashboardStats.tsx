'use client';

import { useState } from 'react';
import { Card, CardDescription, CardHeader } from '@/components/_ui/card';
import type { DashboardCounts, DotCalendarDay, WardBreakdownRow } from './types';
import { formatShortDate } from './utils';

type DashboardStatsProps = {
  activeBuildingKey: 'stake' | 'maples';
  dashboardCounts: DashboardCounts;
  wardBreakdownVisible: WardBreakdownRow[];
  wardBreakdownRemaining: number;
  dotCalendarDays: DotCalendarDay[];
  todayYmd: string;
  weekdayLabels: readonly string[];
};

type MobileStatView = 'next-4-weeks' | 'event-totals' | 'by-ward';

export function DashboardStats({
  activeBuildingKey,
  dashboardCounts,
  wardBreakdownVisible,
  wardBreakdownRemaining,
  dotCalendarDays,
  todayYmd,
  weekdayLabels,
}: DashboardStatsProps) {
  const [mobileView, setMobileView] = useState<MobileStatView>('next-4-weeks');

  const renderEventTotals = () => (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Pending</span>
        <span className="font-semibold text-yellow-500">
          {dashboardCounts.pendingLicense[activeBuildingKey]}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Active</span>
        <span className="font-semibold text-[#2da44e]">
          {dashboardCounts.activeLicense[activeBuildingKey]}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Upcoming</span>
        <span className="font-semibold text-primary">{dashboardCounts.upcoming[activeBuildingKey]}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Past</span>
        <span className="font-semibold text-muted-foreground">{dashboardCounts.past[activeBuildingKey]}</span>
      </div>
    </div>
  );

  const renderWardCard = () => {
    if (wardBreakdownVisible.length === 0) {
      return <div className="text-xs text-muted-foreground">No events by ward yet.</div>;
    }

    return (
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
        {wardBreakdownVisible.map((row) => (
          <div
            key={row.ward}
            className="rounded-md border border-border/60 bg-background/60 px-2 py-2"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span className="truncate text-muted-foreground">{row.ward}</span>
              <span className="font-medium">{row.total}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
              <div className="flex h-full w-full">
                {row.pending > 0 && (
                  <div
                    className="h-full bg-yellow-400"
                    style={{ width: `${(row.pending / row.total) * 100}%` }}
                  />
                )}
                {row.active > 0 && (
                  <div
                    className="h-full bg-emerald-600"
                    style={{ width: `${(row.active / row.total) * 100}%` }}
                  />
                )}
                {row.upcoming > 0 && (
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(row.upcoming / row.total) * 100}%` }}
                  />
                )}
                {row.past > 0 && (
                  <div
                    className="h-full bg-muted-foreground/50"
                    style={{ width: `${(row.past / row.total) * 100}%` }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
        {wardBreakdownRemaining > 0 && (
          <div className="rounded-md border border-dashed border-border/60 px-2 py-2 text-[11px] text-muted-foreground">
            +{wardBreakdownRemaining} more
          </div>
        )}
      </div>
    );
  };

  const renderNext4Weeks = () => (
    <div className="w-full">
      <div className="flex w-full items-center justify-between text-[10px] text-muted-foreground">
        {weekdayLabels.map((label, index) => (
          <div key={`${label}-${index}`} className="w-4 text-center leading-none">
            {label}
          </div>
        ))}
      </div>
      <div className="mt-2 space-y-2">
        {[0, 1, 2, 3].map((weekIndex) => {
          const week = dotCalendarDays.slice(weekIndex * 7, weekIndex * 7 + 7);
          return (
            <div key={`week-${weekIndex}`} className="flex w-full items-center justify-between">
              {week.map((day) => {
                const isToday = day.ymd === todayYmd;
                const hasPending = day.pending > 0;
                const hasActive = day.active > 0;
                const hasUpcoming = day.upcoming > 0;
                const dotClass =
                  day.count === 0
                    ? 'bg-muted-foreground/30'
                    : hasPending
                      ? 'bg-yellow-400'
                      : hasActive
                        ? 'bg-emerald-600'
                        : hasUpcoming
                          ? 'bg-primary'
                          : 'bg-primary';
                const statusLabel =
                  day.count === 0
                    ? 'no events'
                    : [
                        day.pending > 0 ? `${day.pending} pending` : null,
                        day.active > 0 ? `${day.active} active` : null,
                        day.upcoming > 0 ? `${day.upcoming} upcoming` : null,
                      ]
                        .filter(Boolean)
                        .join(', ');
                const title = `${formatShortDate(day.ymd)}${
                  isToday ? ' (today)' : ''
                } - ${day.count} event${day.count === 1 ? '' : 's'}${
                  day.count > 0 ? ` (${statusLabel})` : ''
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
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:hidden">
        <Card className="h-full">
          <CardHeader className="h-full py-3">
            <div className="inline-flex w-full rounded-md border border-border/60 bg-background/80 p-1">
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mobileView === 'next-4-weeks'
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileView('next-4-weeks')}
              >
                Next 4 Weeks
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mobileView === 'event-totals'
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileView('event-totals')}
              >
                Event Totals
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  mobileView === 'by-ward'
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileView('by-ward')}
              >
                By Ward
              </button>
            </div>
            <div className="mt-3 border-t border-border/60" />
            <div className="mt-3">
              {mobileView === 'next-4-weeks'
                ? renderNext4Weeks()
                : mobileView === 'event-totals'
                  ? renderEventTotals()
                  : renderWardCard()}
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="hidden grid-cols-1 gap-4 lg:grid lg:grid-cols-3">
        <Card className="h-full">
          <CardHeader className="h-full py-3 flex flex-col">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Event totals
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className="mt-3 flex-1 flex items-center">{renderEventTotals()}</div>
          </CardHeader>
        </Card>

        <Card className="h-full">
          <CardHeader className="h-full py-3 flex flex-col">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              By ward
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className="mt-3 flex-1 flex items-center">{renderWardCard()}</div>
          </CardHeader>
        </Card>

        <Card className="h-full">
          <CardHeader className="h-full py-3 flex flex-col">
            <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              Next 4 weeks
            </CardDescription>
            <div className="mt-2 border-t border-border/60" />
            <div className="mt-3 flex-1 flex items-center">{renderNext4Weeks()}</div>
          </CardHeader>
        </Card>
      </div>
    </>
  );
}
