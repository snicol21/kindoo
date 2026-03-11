import type { Building } from '@/schema/schema';
import type { EventWithCreator } from '@/actions/events';
import type { DashboardCounts, DashboardTab, DotCalendarDay, WardBreakdownRow } from './types';

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

function parseTimeToMinutes(time: string) {
  const parts = time.split(':');
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getDueTimestamp(eventDate: string, startTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return Number.NaN;
  const licenseWindowStart = Math.max(5 * 60, startMinutes - 120);
  const dueMinutes = Math.max(0, licenseWindowStart - 120);
  const dueHours = Math.floor(dueMinutes / 60);
  const dueRemainderMinutes = dueMinutes % 60;
  const dueTime = `${String(dueHours).padStart(2, '0')}:${String(dueRemainderMinutes).padStart(2, '0')}`;
  return new Date(`${eventDate}T${dueTime}:00`).getTime();
}

function isPendingAutomation(event: EventWithCreator) {
  if (event.kindooLicenseCreated) return false;
  const now = Date.now();
  const dueTimestamp = getDueTimestamp(event.eventDate, event.startTime);
  const eventEnd = new Date(`${event.eventDate}T${event.endTime}:00`).getTime();
  if (!Number.isFinite(dueTimestamp) || !Number.isFinite(eventEnd)) return false;
  return now >= dueTimestamp && now <= eventEnd;
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
  maplesUpcoming: EventWithCreator[]
): DashboardCounts {
  const stakePending = stakeUpcoming.filter((event) => isPendingAutomation(event)).length;
  const maplesPending = maplesUpcoming.filter((event) => isPendingAutomation(event)).length;
  const stakeActive = stakeUpcoming.filter((event) => event.kindooLicenseCreated).length;
  const maplesActive = maplesUpcoming.filter((event) => event.kindooLicenseCreated).length;
  const stakeFuture = stakeUpcoming.length - stakePending - stakeActive;
  const maplesFuture = maplesUpcoming.length - maplesPending - maplesActive;
  const stakePast = stakeCenterEvents.length - stakeUpcoming.length;
  const maplesPast = maplesEvents.length - maplesUpcoming.length;

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
      stake: stakeFuture,
      maples: maplesFuture,
      total: stakeFuture + maplesFuture,
    },
    past: {
      stake: stakePast,
      maples: maplesPast,
      total: stakePast + maplesPast,
    },
  };
}

export function buildWardBreakdown(events: EventWithCreator[]): WardBreakdownRow[] {
  const byWard = new Map<
    string,
    { pending: number; active: number; upcoming: number; past: number; total: number }
  >();

  for (const event of events) {
    const key = event.contactWard ?? 'Unknown';
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
    } else if (event.kindooLicenseCreated) {
      current.active += 1;
    } else if (isPendingAutomation(event)) {
      current.pending += 1;
    } else {
      current.upcoming += 1;
    }

    byWard.set(key, current);
  }

  return Array.from(byWard.entries())
    .map(([ward, counts]) => ({ ward, ...counts }))
    .filter((row) => row.total > 0)
    .sort((a, b) => a.ward.localeCompare(b.ward));
}

export function buildDotCalendarDays(activeUpcoming: EventWithCreator[]): DotCalendarDay[] {
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

    if (event.kindooLicenseCreated) {
      current.active += 1;
    } else if (isPendingAutomation(event)) {
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

  for (let i = 0; i < 56; i += 1) {
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
