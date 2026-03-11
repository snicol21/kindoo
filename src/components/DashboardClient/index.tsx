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
  const [selectedMaplesIds, setSelectedMaplesIds] = useState<string[]>([]);
  const [bulkDeleteTarget, setBulkDeleteTarget] = useState<Building | null>(null);

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

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredStakeUpcoming = useMemo(() => {
    if (!normalizedSearch) return stakeUpcoming;
    return stakeUpcoming.filter((event) =>
      buildEventSearchHaystack(event).includes(normalizedSearch)
    );
  }, [normalizedSearch, stakeUpcoming]);

  const filteredMaplesUpcoming = useMemo(() => {
    if (!normalizedSearch) return maplesUpcoming;
    return maplesUpcoming.filter((event) =>
      buildEventSearchHaystack(event).includes(normalizedSearch)
    );
  }, [normalizedSearch, maplesUpcoming]);

  const dashboardCounts = useMemo(
    () => buildDashboardCounts(stakeCenterEvents, maplesEvents, stakeUpcoming, maplesUpcoming),
    [maplesEvents, maplesUpcoming, stakeCenterEvents, stakeUpcoming]
  );

  const activeBuildingKey = activeTab === 'maples-building' ? 'maples' : 'stake';
  const activeUpcoming = activeTab === 'maples-building' ? maplesUpcoming : stakeUpcoming;
  const activeBuildingName = activeTab === 'maples-building' ? 'Maples Building' : 'Stake Center';
  const activeBuildingSubtitle =
    activeTab === 'maples-building'
      ? 'All upcoming events at Maples Building'
      : 'All upcoming events at Stake Center';

  const dotCalendarDays = useMemo(() => buildDotCalendarDays(activeUpcoming), [activeUpcoming]);

  useEffect(() => {
    const upcomingIds = new Set(stakeUpcoming.map((event) => event.id));
    setSelectedStakeIds((prev) => prev.filter((id) => upcomingIds.has(id)));
  }, [stakeUpcoming]);

  useEffect(() => {
    const upcomingIds = new Set(maplesUpcoming.map((event) => event.id));
    setSelectedMaplesIds((prev) => prev.filter((id) => upcomingIds.has(id)));
  }, [maplesUpcoming]);

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
          stakeCount={stakeUpcoming.length}
          maplesCount={maplesUpcoming.length}
          searchValue={searchQuery}
          onSearchChangeAction={setSearchQuery}
          canToggleBuildings={canToggleBuildings}
          fixedBuildingLabel={fixedBuildingForWardUsers}
        />

        <DashboardEventsHeader
          title={`${activeBuildingName} Events`}
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
            onOpenBulkDeleteAction={() => setBulkDeleteTarget('Stake Center')}
          />
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
            onOpenBulkDeleteAction={() => setBulkDeleteTarget('Maples Building')}
          />
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
