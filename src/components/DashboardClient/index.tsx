'use client';

import type { EventWithCreator } from '@/actions/events';
import { Tabs, TabsContent } from '@/components/_ui/tabs';
import { AddEventDialog } from '@/components/AddEventDialog';
import { CsvImportDialog } from '@/components/CsvImportDialog';
import { BulkDeleteDialog } from '@/components/DashboardClient/BulkDeleteDialog';
import { WEEKDAY_LABELS } from '@/components/DashboardClient/constants';
import { DashboardEventsHeader } from '@/components/DashboardClient/DashboardEventsHeader';
import { DashboardStats } from '@/components/DashboardClient/DashboardStats';
import { DashboardTabsHeader } from '@/components/DashboardClient/DashboardTabsHeader';
import { EventsTabPanel } from '@/components/DashboardClient/EventsTabPanel';
import type { DashboardClientProps, DashboardTab } from '@/components/DashboardClient/types';
import {
  buildDashboardCounts,
  buildDotCalendarDays,
  buildingToTab,
  isOutsideDashboardWindow,
  isPastEvent,
  normalizeTab,
  tabToBuilding,
} from '@/components/DashboardClient/utils';
import { PageContainer } from '@/components/PageContainer';
import {
  useAddEvent,
  useBulkDeleteEvents,
  useDeleteEvent,
  useEvents,
  useSetKindooLicenseCreated,
  useUpdateEvent,
} from '@/hooks/useEvents';
import type { Building } from '@/schema/schema';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const buildEventSearchHaystack = (event: EventWithCreator) =>
  [
    event.contactName,
    event.contactWard,
    event.eventType,
    event.contactEmail,
    event.contactPhone,
    event.description,
    event.eventDate,
    event.startTime,
    event.endTime,
    event.creatorName,
    event.creatorEmail,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export function DashboardClient({
  initialStakeCenterEvents,
  initialMaplesEvents,
  initialDefaultBuilding = 'Stake Center',
  initialTab,
  todayYmd,
  messageTemplates,
  currentUserRole,
  currentUserWard,
  canSelectAnyWard,
  fixedBuildingForWardUsers,
  defaultEventType,
}: DashboardClientProps) {
  type BulkDeleteTarget = {
    building: Building;
    section: 'main' | 'past';
  };

  const fixedTabForWardUsers = fixedBuildingForWardUsers
    ? buildingToTab(fixedBuildingForWardUsers)
    : null;
  const canToggleBuildings = fixedTabForWardUsers === null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [defaultBuilding, setDefaultBuilding] = useState<Building>(initialDefaultBuilding);
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    fixedTabForWardUsers ?? initialTab ?? buildingToTab(initialDefaultBuilding)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStakeIds, setSelectedStakeIds] = useState<string[]>([]);
  const [selectedStakePastIds, setSelectedStakePastIds] = useState<string[]>([]);
  const [selectedMaplesIds, setSelectedMaplesIds] = useState<string[]>([]);
  const [selectedMaplesPastIds, setSelectedMaplesPastIds] = useState<string[]>([]);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<BulkDeleteTarget | null>(null);
  const [showStakePastEvents, setShowStakePastEvents] = useState(false);
  const [showMaplesPastEvents, setShowMaplesPastEvents] = useState(false);

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

  const stakeMainEvents = useMemo(
    () => stakeCenterEvents.filter((event) => !isPastEvent(event.eventDate, event.endTime)),
    [stakeCenterEvents]
  );

  const maplesMainEvents = useMemo(
    () => maplesEvents.filter((event) => !isPastEvent(event.eventDate, event.endTime)),
    [maplesEvents]
  );

  const stakePastEvents = useMemo(
    () => stakeCenterEvents.filter((event) => isPastEvent(event.eventDate, event.endTime)),
    [stakeCenterEvents]
  );

  const maplesPastEvents = useMemo(
    () => maplesEvents.filter((event) => isPastEvent(event.eventDate, event.endTime)),
    [maplesEvents]
  );

  const stakeCalendarEvents = useMemo(
    () => stakeCenterEvents.filter((event) => !isOutsideDashboardWindow(event.eventDate)),
    [stakeCenterEvents]
  );

  const maplesCalendarEvents = useMemo(
    () => maplesEvents.filter((event) => !isOutsideDashboardWindow(event.eventDate)),
    [maplesEvents]
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredStakeUpcoming = useMemo(() => {
    if (!normalizedSearch) return stakeMainEvents;
    return stakeMainEvents.filter((event) =>
      buildEventSearchHaystack(event).includes(normalizedSearch)
    );
  }, [normalizedSearch, stakeMainEvents]);

  const filteredMaplesUpcoming = useMemo(() => {
    if (!normalizedSearch) return maplesMainEvents;
    return maplesMainEvents.filter((event) =>
      buildEventSearchHaystack(event).includes(normalizedSearch)
    );
  }, [normalizedSearch, maplesMainEvents]);

  const filteredStakePast = useMemo(() => {
    if (!normalizedSearch) return stakePastEvents;
    return stakePastEvents.filter((event) =>
      buildEventSearchHaystack(event).includes(normalizedSearch)
    );
  }, [normalizedSearch, stakePastEvents]);

  const filteredMaplesPast = useMemo(() => {
    if (!normalizedSearch) return maplesPastEvents;
    return maplesPastEvents.filter((event) =>
      buildEventSearchHaystack(event).includes(normalizedSearch)
    );
  }, [normalizedSearch, maplesPastEvents]);

  const dashboardCounts = useMemo(
    () => buildDashboardCounts(stakeCenterEvents, maplesEvents),
    [maplesEvents, stakeCenterEvents]
  );

  const activeBuildingKey = activeTab === 'maples-building' ? 'maples' : 'stake';
  const activeUpcoming = activeTab === 'maples-building' ? maplesMainEvents : stakeMainEvents;
  const activeCalendarEvents =
    activeTab === 'maples-building' ? maplesCalendarEvents : stakeCalendarEvents;
  const activeBuildingName = activeTab === 'maples-building' ? 'Maples Building' : 'Stake Center';
  const activeBuildingSubtitle =
    activeTab === 'maples-building'
      ? 'All upcoming events at Maples Building'
      : 'All upcoming events at Stake Center';

  const dotCalendarDays = useMemo(
    () => buildDotCalendarDays(activeCalendarEvents),
    [activeCalendarEvents]
  );

  useEffect(() => {
    const upcomingIds = new Set(filteredStakeUpcoming.map((event) => event.id));
    setSelectedStakeIds((prev) => prev.filter((id) => upcomingIds.has(id)));
  }, [filteredStakeUpcoming]);

  useEffect(() => {
    const pastIds = new Set(filteredStakePast.map((event) => event.id));
    setSelectedStakePastIds((prev) => prev.filter((id) => pastIds.has(id)));
  }, [filteredStakePast]);

  useEffect(() => {
    const upcomingIds = new Set(filteredMaplesUpcoming.map((event) => event.id));
    setSelectedMaplesIds((prev) => prev.filter((id) => upcomingIds.has(id)));
  }, [filteredMaplesUpcoming]);

  useEffect(() => {
    const pastIds = new Set(filteredMaplesPast.map((event) => event.id));
    setSelectedMaplesPastIds((prev) => prev.filter((id) => pastIds.has(id)));
  }, [filteredMaplesPast]);

  useEffect(() => {
    if (fixedTabForWardUsers && activeTab !== fixedTabForWardUsers) {
      setActiveTab(fixedTabForWardUsers);
      return;
    }

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
  }, [activeTab, fixedTabForWardUsers]);

  const openDialogFor = (building: Building) => {
    setDefaultBuilding(building);
    setDialogOpen(true);
  };

  const selectedCount =
    bulkDeleteTarget?.building === 'Stake Center'
      ? bulkDeleteTarget.section === 'past'
        ? selectedStakePastIds.length
        : selectedStakeIds.length
      : bulkDeleteTarget?.building === 'Maples Building'
        ? bulkDeleteTarget.section === 'past'
          ? selectedMaplesPastIds.length
          : selectedMaplesIds.length
        : 0;

  const confirmBulkDelete = async () => {
    if (bulkDeleteTarget?.building === 'Stake Center') {
      const idsToDelete =
        bulkDeleteTarget.section === 'past' ? selectedStakePastIds : selectedStakeIds;
      if (idsToDelete.length > 0) {
        await bulkDeleteStakeCenterEvents.mutateAsync(idsToDelete);
        if (bulkDeleteTarget.section === 'past') {
          setSelectedStakePastIds([]);
        } else {
          setSelectedStakeIds([]);
        }
      }
    }

    if (bulkDeleteTarget?.building === 'Maples Building') {
      const idsToDelete =
        bulkDeleteTarget.section === 'past' ? selectedMaplesPastIds : selectedMaplesIds;
      if (idsToDelete.length > 0) {
        await bulkDeleteMaplesEvents.mutateAsync(idsToDelete);
        if (bulkDeleteTarget.section === 'past') {
          setSelectedMaplesPastIds([]);
        } else {
          setSelectedMaplesIds([]);
        }
      }
    }

    setBulkDeleteTarget(null);
  };

  return (
    <PageContainer width="full" className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (!canToggleBuildings) return;
          setActiveTab(normalizeTab(value));
        }}
        className="space-y-4"
      >
        <DashboardTabsHeader
          stakeCount={stakeMainEvents.length}
          maplesCount={maplesMainEvents.length}
          searchValue={searchQuery}
          onSearchChangeAction={setSearchQuery}
          canToggleBuildings={canToggleBuildings}
          fixedBuildingLabel={fixedBuildingForWardUsers}
        />

        <DashboardEventsHeader
          title={`${activeBuildingName} events`}
          subtitle={activeBuildingSubtitle}
          onAddEventAction={() => openDialogFor(tabToBuilding(activeTab))}
          onImportCsvAction={() => setImportOpen(true)}
        />

        <DashboardStats
          activeBuildingKey={activeBuildingKey}
          dashboardCounts={dashboardCounts}
          currentUserRole={currentUserRole}
          breakdownEvents={activeUpcoming}
          dotCalendarDays={dotCalendarDays}
          todayYmd={todayYmd}
          weekdayLabels={WEEKDAY_LABELS}
        />

        <TabsContent value="stake-center">
          <EventsTabPanel
            events={filteredStakeUpcoming}
            isLoading={scLoading}
            isError={scError}
            building="Stake Center"
            messageTemplates={messageTemplates}
            searchQuery={searchQuery}
            onDeleteAction={(eventId) =>
              deleteStakeCenterEvent.mutateAsync(eventId).then(() => undefined)
            }
            selectedIds={selectedStakeIds}
            onSelectionChangeAction={setSelectedStakeIds}
            onEditAction={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
            onCloneAction={(input) => addEvent.mutateAsync(input).then(() => undefined)}
            onSetKindooLicenseCreatedAction={(input) =>
              setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
            }
            bulkDeletePending={bulkDeleteStakeCenterEvents.isPending}
            onOpenBulkDeleteAction={() =>
              setBulkDeleteTarget({ building: 'Stake Center', section: 'main' })
            }
          />

          <div className="mt-4 rounded-md border border-border/70 bg-card/60">
            <button
              type="button"
              onClick={() => setShowStakePastEvents((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
            >
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/85 dark:bg-amber-300/90"
                />
                <span>Past events ({filteredStakePast.length})</span>
              </span>
              {showStakePastEvents ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showStakePastEvents && (
              <div className="border-t border-border/70 p-3">
                <EventsTabPanel
                  events={filteredStakePast}
                  isLoading={scLoading}
                  isError={scError}
                  building="Stake Center"
                  messageTemplates={messageTemplates}
                  defaultSortDir="desc"
                  searchQuery={searchQuery}
                  emptyStateTitle="No past events"
                  emptyStateMessage="Completed events appear here."
                  onDeleteAction={(eventId) =>
                    deleteStakeCenterEvent.mutateAsync(eventId).then(() => undefined)
                  }
                  selectedIds={selectedStakePastIds}
                  onSelectionChangeAction={setSelectedStakePastIds}
                  onEditAction={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
                  onCloneAction={(input) => addEvent.mutateAsync(input).then(() => undefined)}
                  onSetKindooLicenseCreatedAction={(input) =>
                    setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
                  }
                  bulkDeletePending={bulkDeleteStakeCenterEvents.isPending}
                  onOpenBulkDeleteAction={() =>
                    setBulkDeleteTarget({ building: 'Stake Center', section: 'past' })
                  }
                />
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="maples-building">
          <EventsTabPanel
            events={filteredMaplesUpcoming}
            isLoading={mbLoading}
            isError={mbError}
            building="Maples Building"
            messageTemplates={messageTemplates}
            searchQuery={searchQuery}
            onDeleteAction={(eventId) =>
              deleteMaplesEvent.mutateAsync(eventId).then(() => undefined)
            }
            selectedIds={selectedMaplesIds}
            onSelectionChangeAction={setSelectedMaplesIds}
            onEditAction={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
            onCloneAction={(input) => addEvent.mutateAsync(input).then(() => undefined)}
            onSetKindooLicenseCreatedAction={(input) =>
              setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
            }
            bulkDeletePending={bulkDeleteMaplesEvents.isPending}
            onOpenBulkDeleteAction={() =>
              setBulkDeleteTarget({ building: 'Maples Building', section: 'main' })
            }
          />

          <div className="mt-4 rounded-md border border-border/70 bg-card/60">
            <button
              type="button"
              onClick={() => setShowMaplesPastEvents((prev) => !prev)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
            >
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/85 dark:bg-amber-300/90"
                />
                <span>Past events ({filteredMaplesPast.length})</span>
              </span>
              {showMaplesPastEvents ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showMaplesPastEvents && (
              <div className="border-t border-border/70 p-3">
                <EventsTabPanel
                  events={filteredMaplesPast}
                  isLoading={mbLoading}
                  isError={mbError}
                  building="Maples Building"
                  messageTemplates={messageTemplates}
                  defaultSortDir="desc"
                  searchQuery={searchQuery}
                  emptyStateTitle="No past events"
                  emptyStateMessage="Completed events appear here."
                  onDeleteAction={(eventId) =>
                    deleteMaplesEvent.mutateAsync(eventId).then(() => undefined)
                  }
                  selectedIds={selectedMaplesPastIds}
                  onSelectionChangeAction={setSelectedMaplesPastIds}
                  onEditAction={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
                  onCloneAction={(input) => addEvent.mutateAsync(input).then(() => undefined)}
                  onSetKindooLicenseCreatedAction={(input) =>
                    setKindooLicenseCreated.mutateAsync(input).then(() => undefined)
                  }
                  bulkDeletePending={bulkDeleteMaplesEvents.isPending}
                  onOpenBulkDeleteAction={() =>
                    setBulkDeleteTarget({ building: 'Maples Building', section: 'past' })
                  }
                />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AddEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultBuilding={defaultBuilding}
        defaultEventType={defaultEventType}
        fixedBuilding={fixedBuildingForWardUsers}
        fixedWard={canSelectAnyWard ? undefined : currentUserWard}
      />

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <BulkDeleteDialog
        open={bulkDeleteTarget !== null}
        selectedCount={selectedCount}
        deleting={bulkDeleteStakeCenterEvents.isPending || bulkDeleteMaplesEvents.isPending}
        onCloseAction={() => setBulkDeleteTarget(null)}
        onConfirmAction={confirmBulkDelete}
      />
    </PageContainer>
  );
}
