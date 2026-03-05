import type { Building } from '@/schema/schema';
import type { EventWithCreator } from '@/actions/events';
import type { DashboardCounts, DashboardTab, DotCalendarDay, WardBreakdownRow } from './types';
import { DEFAULT_LICENSE_LEAD_DAYS, MAX_LICENSE_LEAD_DAYS } from './constants';

export function buildingToTab(building: Building): DashboardTab {
  return building === 'Maples Building' ? 'maples-building' : 'stake-center';
}

export function tabToBuilding(tab: string): Building {
  return tab === 'maples-building' ? 'Maples Building' : 'Stake Center';
}

export function normalizeTab(tab: string | null | undefined): DashboardTab {
  return tab === 'maples-building' ? 'maples-building' : 'stake-center';
}

export function isPastEvent(eventDate: string, endTime: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const [hours, minutes] = endTime.split(':').map((value) => Number(value));
  const eventEnd = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0).getTime();
  return eventEnd < Date.now();
}

export function getDaysUntilValue(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const eventDate = new Date(year, month - 1, day);
  if (Number.isNaN(eventDate.getTime())) return Number.NaN;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = eventDate.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function parseYmdToDate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatShortDate(dateStr: string) {
  const date = parseYmdToDate(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function normalizeLicenseLeadDays(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LICENSE_LEAD_DAYS;
  const normalized = Math.round(parsed);
  if (normalized < 0 || normalized > MAX_LICENSE_LEAD_DAYS) return DEFAULT_LICENSE_LEAD_DAYS;
  return normalized;
}

export function getTodayYmd() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

export function buildDashboardCounts(
  stakeCenterEvents: EventWithCreator[],
  maplesEvents: EventWithCreator[],
  stakeUpcoming: EventWithCreator[],
  maplesUpcoming: EventWithCreator[],
  licenseLeadDays: number
): DashboardCounts {
  const withinLeadWindow = (event: EventWithCreator) => {
    const daysUntil = getDaysUntilValue(event.eventDate);
    return Number.isFinite(daysUntil) && daysUntil >= 0 && daysUntil <= licenseLeadDays;
  };

  const stakeWindowed = stakeUpcoming.filter(withinLeadWindow);
  const maplesWindowed = maplesUpcoming.filter(withinLeadWindow);
  const stakeOutsideWindow = stakeUpcoming.length - stakeWindowed.length;
  const maplesOutsideWindow = maplesUpcoming.length - maplesWindowed.length;
  const stakePast = stakeCenterEvents.length - stakeUpcoming.length;
  const maplesPast = maplesEvents.length - maplesUpcoming.length;
  const stakePending = stakeWindowed.filter((event) => !event.kindooLicenseCreated).length;
  const maplesPending = maplesWindowed.filter((event) => !event.kindooLicenseCreated).length;
  const stakeActive = stakeWindowed.length - stakePending;
  const maplesActive = maplesWindowed.length - maplesPending;

  return {
    pendingLicense: {
      stake: stakePending,
      maples: maplesPending,
      total: stakePending + maplesPending,
    },
    activeLicense: {
      stake: stakeActive,
      maples: maplesActive,
      total: stakeActive + maplesActive,
    },
    upcoming: {
      stake: stakeOutsideWindow,
      maples: maplesOutsideWindow,
      total: stakeOutsideWindow + maplesOutsideWindow,
    },
    past: {
      stake: stakePast,
      maples: maplesPast,
      total: stakePast + maplesPast,
    },
  };
}

export function buildWardBreakdown(
  events: EventWithCreator[],
  licenseLeadDays: number
): WardBreakdownRow[] {
  const byWard = new Map<
    string,
    { pending: number; active: number; upcoming: number; past: number; total: number }
  >();

  for (const event of events) {
    const key = event.ward ?? 'Unknown';
    const current = byWard.get(key) ?? {
      pending: 0,
      active: 0,
      upcoming: 0,
      past: 0,
      total: 0,
    };

    current.total += 1;
    if (isPastEvent(event.eventDate, event.endTime)) {
      current.past += 1;
    } else {
      const daysUntil = getDaysUntilValue(event.eventDate);
      const withinWindow =
        Number.isFinite(daysUntil) && daysUntil >= 0 && daysUntil <= licenseLeadDays;
      if (withinWindow && event.kindooLicenseCreated) {
        current.active += 1;
      } else if (withinWindow) {
        current.pending += 1;
      } else {
        current.upcoming += 1;
      }
    }

    byWard.set(key, current);
  }

  return Array.from(byWard.entries())
    .map(([ward, counts]) => ({ ward, ...counts }))
    .filter((row) => row.total > 0)
    .sort((a, b) => a.ward.localeCompare(b.ward));
}

export function buildDotCalendarDays(
  activeUpcoming: EventWithCreator[],
  licenseLeadDays: number
): DotCalendarDay[] {
  const counts = new Map<
    string,
    { total: number; pending: number; active: number; upcoming: number }
  >();
  for (const event of activeUpcoming) {
    const current = counts.get(event.eventDate) ?? {
      total: 0,
      pending: 0,
      active: 0,
      upcoming: 0,
    };
    current.total += 1;

    const daysUntil = getDaysUntilValue(event.eventDate);
    const withinWindow =
      Number.isFinite(daysUntil) && daysUntil >= 0 && daysUntil <= licenseLeadDays;
    if (withinWindow && event.kindooLicenseCreated) {
      current.active += 1;
    } else if (withinWindow) {
      current.pending += 1;
    } else {
      current.upcoming += 1;
    }

    counts.set(event.eventDate, current);
  }

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - start.getDay());
  const days: DotCalendarDay[] = [];

  for (let i = 0; i < 28; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
    const dayCounts = counts.get(ymd) ?? { total: 0, pending: 0, active: 0, upcoming: 0 };
    days.push({
      ymd,
      count: dayCounts.total,
      pending: dayCounts.pending,
      active: dayCounts.active,
      upcoming: dayCounts.upcoming,
    });
  }

  return days;
}
