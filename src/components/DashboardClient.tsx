'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EventTable } from '@/components/EventTable';
import { AddEventDialog } from '@/components/AddEventDialog';
import { CsvImportDialog } from '@/components/CsvImportDialog';
import {
  useAddEvent,
  useBulkDeleteEvents,
  useDeleteEvent,
  useSetKindooLicenseCreated,
  useEvents,
  useUpdateEvent,
} from '@/hooks/useEvents';
import { Building2, Plus, CalendarDays, Upload } from 'lucide-react';
import type { Building } from '@/schema/schema';
import type { EventWithCreator } from '@/actions/events';
import type { MessageTemplateMap } from '@/lib/message-templates';

interface DashboardClientProps {
  initialStakeCenterEvents: EventWithCreator[];
  initialMaplesEvents: EventWithCreator[];
  initialLicenseLeadDays?: number | null;
  initialDefaultBuilding?: Building;
  initialTab?: DashboardTab;
  messageTemplates: MessageTemplateMap;
}

type DashboardTab = 'stake-center' | 'maples-building';

function buildingToTab(building: Building): DashboardTab {
  return building === 'Maples Building' ? 'maples-building' : 'stake-center';
}

function tabToBuilding(tab: string): Building {
  return tab === 'maples-building' ? 'Maples Building' : 'Stake Center';
}

function normalizeTab(tab: string | null | undefined): DashboardTab {
  return tab === 'maples-building' ? 'maples-building' : 'stake-center';
}

function isPastEvent(eventDate: string, endTime: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const [hours, minutes] = endTime.split(':').map((value) => Number(value));
  const eventEnd = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0).getTime();
  return eventEnd < Date.now();
}

function getDaysUntilValue(dateStr: string) {
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

function parseYmdToDate(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(dateStr: string) {
  const date = parseYmdToDate(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const LICENSE_LEAD_KEY = 'kindoo.licenseLeadDays';
const DEFAULT_LICENSE_LEAD_DAYS = 2;
const MAX_LICENSE_LEAD_DAYS = 14;

function normalizeLicenseLeadDays(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LICENSE_LEAD_DAYS;
  const normalized = Math.round(parsed);
  if (normalized < 0 || normalized > MAX_LICENSE_LEAD_DAYS) return DEFAULT_LICENSE_LEAD_DAYS;
  return normalized;
}

export function DashboardClient({
  initialStakeCenterEvents,
  initialMaplesEvents,
  initialLicenseLeadDays,
  initialDefaultBuilding = 'Stake Center',
  initialTab,
  messageTemplates,
}: DashboardClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [defaultBuilding, setDefaultBuilding] = useState<Building>(initialDefaultBuilding);
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    initialTab ?? buildingToTab(initialDefaultBuilding)
  );
  const [selectedStakeIds, setSelectedStakeIds] = useState<string[]>([]);
  const [selectedMaplesIds, setSelectedMaplesIds] = useState<string[]>([]);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<Building | null>(null);
  const [licenseLeadDays, setLicenseLeadDays] = useState(() =>
    normalizeLicenseLeadDays(initialLicenseLeadDays)
  );

  const {
    data: stakeCenterEvents = [],
    isLoading: scLoading,
    isError: scError,
  } = useEvents('Stake Center', initialStakeCenterEvents);

  const {
    data: maplesEvents = [],
    isLoading: mbLoading,
    isError: mbError,
  } = useEvents('Maples Building', initialMaplesEvents);

  const deleteStakeCenterEvent = useDeleteEvent('Stake Center');
  const deleteMaplesEvent = useDeleteEvent('Maples Building');
  const bulkDeleteStakeCenterEvents = useBulkDeleteEvents('Stake Center');
  const bulkDeleteMaplesEvents = useBulkDeleteEvents('Maples Building');
  const updateEvent = useUpdateEvent();
  const addEvent = useAddEvent();
  const setKindooLicenseCreated = useSetKindooLicenseCreated();

  const stakeUpcoming = useMemo(
    () => stakeCenterEvents.filter((event) => !isPastEvent(event.eventDate, event.endTime)),
    [stakeCenterEvents]
  );

  const maplesUpcoming = useMemo(
    () => maplesEvents.filter((event) => !isPastEvent(event.eventDate, event.endTime)),
    [maplesEvents]
  );

  const dashboardCounts = useMemo(() => {
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
  }, [
    licenseLeadDays,
    maplesEvents.length,
    maplesUpcoming,
    stakeCenterEvents.length,
    stakeUpcoming,
  ]);

  const activeBuildingKey = activeTab === 'maples-building' ? 'maples' : 'stake';
  const activeBuildingEvents = activeTab === 'maples-building' ? maplesEvents : stakeCenterEvents;
  const activeUpcoming = activeTab === 'maples-building' ? maplesUpcoming : stakeUpcoming;
  const activeBuildingName = activeTab === 'maples-building' ? 'Maples Building' : 'Stake Center';
  const activeBuildingSubtitle =
    activeTab === 'maples-building'
      ? 'All upcoming events at Maples Building'
      : 'All upcoming events at Stake Center';
  const wardBreakdown = useMemo(() => {
    const byWard = new Map<
      string,
      { pending: number; active: number; upcoming: number; past: number; total: number }
    >();

    for (const event of activeBuildingEvents) {
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
  }, [activeBuildingEvents, licenseLeadDays]);
  const wardBreakdownVisible = wardBreakdown.slice(0, 8);
  const wardBreakdownRemaining = Math.max(0, wardBreakdown.length - wardBreakdownVisible.length);

  const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

  const todayYmd = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
  }, []);

  const dotCalendarDays = useMemo(() => {
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
    const days: Array<{
      ymd: string;
      count: number;
      pending: number;
      active: number;
      upcoming: number;
    }> = [];

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
  }, [activeUpcoming, licenseLeadDays]);

  useEffect(() => {
    const upcomingIds = new Set(stakeUpcoming.map((event) => event.id));
    setSelectedStakeIds((prev) => prev.filter((id) => upcomingIds.has(id)));
  }, [stakeUpcoming]);

  useEffect(() => {
    const upcomingIds = new Set(maplesUpcoming.map((event) => event.id));
    setSelectedMaplesIds((prev) => prev.filter((id) => upcomingIds.has(id)));
  }, [maplesUpcoming]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const rawBuilding = url.searchParams.get('building');
    const hasValidBuilding = rawBuilding === 'stake-center' || rawBuilding === 'maples-building';
    const current = hasValidBuilding ? rawBuilding : null;

    if (current !== activeTab) {
      url.searchParams.set('building', activeTab);
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}?${url.searchParams.toString()}${url.hash}`
      );
    }
    setDefaultBuilding(tabToBuilding(activeTab));
  }, [activeTab]);

  useEffect(() => {
    if (Number.isFinite(initialLicenseLeadDays)) {
      const normalized = normalizeLicenseLeadDays(
        initialLicenseLeadDays ?? DEFAULT_LICENSE_LEAD_DAYS
      );
      setLicenseLeadDays(normalized);
      window.localStorage.setItem(LICENSE_LEAD_KEY, String(normalized));
    } else {
      const stored = window.localStorage.getItem(LICENSE_LEAD_KEY);
      setLicenseLeadDays(normalizeLicenseLeadDays(stored));
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LICENSE_LEAD_KEY) return;
      setLicenseLeadDays(normalizeLicenseLeadDays(event.newValue));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [initialLicenseLeadDays]);

  const openDialogFor = (building: Building) => {
    setDefaultBuilding(building);
    setDialogOpen(true);
  };

  const selectedCount =
    bulkDeleteTarget === 'Stake Center'
      ? selectedStakeIds.length
      : bulkDeleteTarget === 'Maples Building'
        ? selectedMaplesIds.length
        : 0;

  const confirmBulkDelete = async () => {
    if (bulkDeleteTarget === 'Stake Center' && selectedStakeIds.length > 0) {
      await bulkDeleteStakeCenterEvents.mutateAsync(selectedStakeIds);
      setSelectedStakeIds([]);
    }

    if (bulkDeleteTarget === 'Maples Building' && selectedMaplesIds.length > 0) {
      await bulkDeleteMaplesEvents.mutateAsync(selectedMaplesIds);
      setSelectedMaplesIds([]);
    }

    setBulkDeleteTarget(null);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(normalizeTab(value))}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="order-1 w-full gap-2 sm:order-2 sm:w-auto sm:ml-auto"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <TabsList className="w-full sm:w-auto order-2 sm:order-1">
            <TabsTrigger value="stake-center" className="flex-1 gap-2 sm:flex-none">
              <Building2 className="hidden h-4 w-4 sm:inline-block" />
              Stake Center
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {stakeUpcoming.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="maples-building" className="flex-1 gap-2 sm:flex-none">
              <Building2 className="hidden h-4 w-4 sm:inline-block" />
              Maples Building
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {maplesUpcoming.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-muted-foreground" />
                {activeBuildingName} Events
              </CardTitle>
              <CardDescription>{activeBuildingSubtitle}</CardDescription>
            </div>
            <div className="flex w-full flex-row flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
              <Button
                onClick={() => openDialogFor(tabToBuilding(activeTab))}
                className="flex-1 gap-2 sm:flex-none"
              >
                <Plus className="h-4 w-4" />
                Add Event
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="h-full">
            <CardHeader className="h-full py-3 flex flex-col">
              <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Event totals
              </CardDescription>
              <div className="mt-2 border-t border-border/60" />
              <div className="mt-3 flex-1 flex items-center">
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
                    <span className="font-semibold">
                      {dashboardCounts.upcoming[activeBuildingKey]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Past</span>
                    <span className="font-semibold text-muted-foreground">
                      {dashboardCounts.past[activeBuildingKey]}
                    </span>
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>
          <Card className="h-full">
            <CardHeader className="h-full py-3 flex flex-col">
              <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                By ward
              </CardDescription>
              <div className="mt-2 border-t border-border/60" />
              <div className="mt-3 flex-1 flex items-center">
                {wardBreakdown.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No events by ward yet.</div>
                ) : (
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
                )}
              </div>
            </CardHeader>
          </Card>
          <Card className="h-full">
            <CardHeader className="h-full py-3 flex flex-col">
              <CardDescription className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Next 4 weeks
              </CardDescription>
              <div className="mt-2 border-t border-border/60" />
              <div className="mt-3 flex-1 flex items-center">
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
                        <div
                          key={`week-${weekIndex}`}
                          className="flex w-full items-center justify-between"
                        >
                          {week.map((day) => {
                            const isToday = day.ymd === todayYmd;
                            const hasPending = day.pending > 0;
                            const hasActive = day.active > 0;
                            const hasUpcoming = day.upcoming > 0;
                            const dotClass =
                              day.count === 0
                                ? 'bg-muted/80'
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
                              <div
                                key={day.ymd}
                                title={title}
                                className="flex h-4 w-4 items-center justify-center"
                              >
                                <span className="relative inline-flex h-3 w-3 items-center justify-center">
                                  <span
                                    className={`inline-block h-3 w-3 rounded-full ${dotClass}`}
                                  />
                                  {isToday && (
                                    <span className="absolute text-[12px] leading-none text-purple-500">
                                      ★
                                    </span>
                                  )}
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
            </CardHeader>
          </Card>
        </div>

        <TabsContent value="stake-center">
          <div className="space-y-3">
            {selectedStakeIds.length > 0 && (
              <div className="flex w-full items-center justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={bulkDeleteStakeCenterEvents.isPending}
                  onClick={() => setBulkDeleteTarget('Stake Center')}
                >
                  Delete selected ({selectedStakeIds.length})
                </Button>
              </div>
            )}
            <Card>
              <CardContent className="p-3 sm:p-4">
                <EventTable
                  events={stakeUpcoming}
                  isLoading={scLoading}
                  isError={scError}
                  building="Stake Center"
                  messageTemplates={messageTemplates}
                  onDelete={(eventId) =>
                    deleteStakeCenterEvent.mutateAsync(eventId).then(() => undefined)
                  }
                  selectedIds={selectedStakeIds}
                  onSelectionChange={setSelectedStakeIds}
                  onEdit={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
                  onClone={(input) => addEvent.mutateAsync(input).then(() => undefined)}
                  onSetKindooLicenseCreated={(input) =>
                    setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
                  }
                  licenseLeadDays={licenseLeadDays}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="maples-building">
          <div className="space-y-3">
            {selectedMaplesIds.length > 0 && (
              <div className="flex w-full items-center justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={bulkDeleteMaplesEvents.isPending}
                  onClick={() => setBulkDeleteTarget('Maples Building')}
                >
                  Delete selected ({selectedMaplesIds.length})
                </Button>
              </div>
            )}
            <Card>
              <CardContent className="p-3 sm:p-4">
                <EventTable
                  events={maplesUpcoming}
                  isLoading={mbLoading}
                  isError={mbError}
                  building="Maples Building"
                  messageTemplates={messageTemplates}
                  onDelete={(eventId) =>
                    deleteMaplesEvent.mutateAsync(eventId).then(() => undefined)
                  }
                  selectedIds={selectedMaplesIds}
                  onSelectionChange={setSelectedMaplesIds}
                  onEdit={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
                  onClone={(input) => addEvent.mutateAsync(input).then(() => undefined)}
                  onSetKindooLicenseCreated={(input) =>
                    setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
                  }
                  licenseLeadDays={licenseLeadDays}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Event Dialog */}
      <AddEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultBuilding={defaultBuilding}
      />

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <Dialog
        open={bulkDeleteTarget !== null}
        onOpenChange={(open) => !open && setBulkDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete selected events?</DialogTitle>
            <DialogDescription>
              This will permanently delete {selectedCount} event{selectedCount === 1 ? '' : 's'}.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmBulkDelete}
              disabled={
                selectedCount === 0 ||
                bulkDeleteStakeCenterEvents.isPending ||
                bulkDeleteMaplesEvents.isPending
              }
            >
              {bulkDeleteStakeCenterEvents.isPending || bulkDeleteMaplesEvents.isPending
                ? 'Deleting…'
                : 'Delete selected'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
