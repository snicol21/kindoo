'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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

interface DashboardUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface DashboardClientProps {
  user: DashboardUser;
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
  user,
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
  const [showStakeArchived, setShowStakeArchived] = useState(false);
  const [showMaplesArchived, setShowMaplesArchived] = useState(false);
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

  const [stakeUpcoming, stakeArchived] = useMemo(() => {
    const upcoming: EventWithCreator[] = [];
    const archived: EventWithCreator[] = [];
    for (const event of stakeCenterEvents) {
      if (isPastEvent(event.eventDate, event.endTime)) {
        archived.push(event);
      } else {
        upcoming.push(event);
      }
    }
    return [upcoming, archived];
  }, [stakeCenterEvents]);

  const [maplesUpcoming, maplesArchived] = useMemo(() => {
    const upcoming: EventWithCreator[] = [];
    const archived: EventWithCreator[] = [];
    for (const event of maplesEvents) {
      if (isPastEvent(event.eventDate, event.endTime)) {
        archived.push(event);
      } else {
        upcoming.push(event);
      }
    }
    return [upcoming, archived];
  }, [maplesEvents]);

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

  const userInitials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : (user.email?.[0]?.toUpperCase() ?? '?');

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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12 border-2 border-border">
            <AvatarImage src={user.image ?? undefined} alt={user.name ?? 'User avatar'} />
            <AvatarFallback className="text-sm font-semibold">{userInitials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome back{user.name ? `, ${user.name.split(' ')[0]}` : ''}!
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="flex w-full flex-row flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="flex-1 gap-2 sm:flex-none"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button
            onClick={() => openDialogFor(tabToBuilding(activeTab))}
            className="flex-1 gap-2 sm:flex-none"
          >
            <Plus className="h-4 w-4" />
            Add Event
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="h-full">
          <CardHeader className="h-full justify-center py-3">
            <CardDescription>Total Events</CardDescription>
            <CardTitle className="text-3xl">
              {stakeCenterEvents.length + maplesEvents.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="h-full">
          <CardHeader className="h-full justify-center py-3">
            <CardDescription>Stake Center</CardDescription>
            <CardTitle className="text-3xl">{stakeCenterEvents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="h-full">
          <CardHeader className="h-full justify-center py-3">
            <CardDescription>Maples Building</CardDescription>
            <CardTitle className="text-3xl">{maplesEvents.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(normalizeTab(value))}
        className="space-y-4"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="stake-center" className="flex-1 gap-2 sm:flex-none">
              <Building2 className="hidden h-4 w-4 sm:inline-block" />
              Stake Center
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {stakeCenterEvents.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="maples-building" className="flex-1 gap-2 sm:flex-none">
              <Building2 className="hidden h-4 w-4 sm:inline-block" />
              Maples Building
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {maplesEvents.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stake-center">
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between sm:pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  Stake Center Events
                </CardTitle>
                <CardDescription>All upcoming events at Stake Center</CardDescription>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                {selectedStakeIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={bulkDeleteStakeCenterEvents.isPending}
                    onClick={() => setBulkDeleteTarget('Stake Center')}
                  >
                    Delete selected ({selectedStakeIds.length})
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDialogFor('Stake Center')}
                  className="gap-2 flex-1 sm:flex-none"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-2 py-2 sm:px-6 sm:py-6">
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
              {!scLoading && !scError && stakeArchived.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Archived events ({stakeArchived.length})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowStakeArchived((prev) => !prev)}
                    >
                      {showStakeArchived ? 'Hide archived' : 'Show archived'}
                    </Button>
                  </div>
                  {showStakeArchived && (
                    <div className="mt-4">
                      <EventTable
                        events={stakeArchived}
                        isLoading={false}
                        isError={false}
                        building="Stake Center"
                        messageTemplates={messageTemplates}
                        onDelete={(eventId) =>
                          deleteStakeCenterEvent.mutateAsync(eventId).then(() => undefined)
                        }
                        onEdit={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
                        onClone={(input) => addEvent.mutateAsync(input).then(() => undefined)}
                        onSetKindooLicenseCreated={(input) =>
                          setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
                        }
                        licenseLeadDays={licenseLeadDays}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maples-building">
          <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between sm:pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  Maples Building Events
                </CardTitle>
                <CardDescription>All upcoming events at Maples Building</CardDescription>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
                {selectedMaplesIds.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    disabled={bulkDeleteMaplesEvents.isPending}
                    onClick={() => setBulkDeleteTarget('Maples Building')}
                  >
                    Delete selected ({selectedMaplesIds.length})
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openDialogFor('Maples Building')}
                  className="gap-2 flex-1 sm:flex-none"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-2 py-2 sm:px-6 sm:py-6">
              <EventTable
                events={maplesUpcoming}
                isLoading={mbLoading}
                isError={mbError}
                building="Maples Building"
                messageTemplates={messageTemplates}
                onDelete={(eventId) => deleteMaplesEvent.mutateAsync(eventId).then(() => undefined)}
                selectedIds={selectedMaplesIds}
                onSelectionChange={setSelectedMaplesIds}
                onEdit={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
                onClone={(input) => addEvent.mutateAsync(input).then(() => undefined)}
                onSetKindooLicenseCreated={(input) =>
                  setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
                }
                licenseLeadDays={licenseLeadDays}
              />
              {!mbLoading && !mbError && maplesArchived.length > 0 && (
                <div className="mt-6 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Archived events ({maplesArchived.length})
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMaplesArchived((prev) => !prev)}
                    >
                      {showMaplesArchived ? 'Hide archived' : 'Show archived'}
                    </Button>
                  </div>
                  {showMaplesArchived && (
                    <div className="mt-4">
                      <EventTable
                        events={maplesArchived}
                        isLoading={false}
                        isError={false}
                        building="Maples Building"
                        messageTemplates={messageTemplates}
                        onDelete={(eventId) =>
                          deleteMaplesEvent.mutateAsync(eventId).then(() => undefined)
                        }
                        onEdit={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
                        onClone={(input) => addEvent.mutateAsync(input).then(() => undefined)}
                        onSetKindooLicenseCreated={(input) =>
                          setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
                        }
                        licenseLeadDays={licenseLeadDays}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
