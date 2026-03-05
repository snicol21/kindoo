'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent } from '@/components/_ui/tabs';
import { AddEventDialog } from '@/components/AddEventDialog';
import { CsvImportDialog } from '@/components/CsvImportDialog';
import {
  useAddEvent,
  useBulkDeleteEvents,
  useDeleteEvent,
  useEvents,
  useSetKindooLicenseCreated,
  useUpdateEvent,
} from '@/hooks/useEvents';
import type { Building } from '@/schema/schema';
import type { EventWithCreator } from '@/actions/events';
import { BulkDeleteDialog } from '@/components/DashboardClient/BulkDeleteDialog';
import { DashboardEventsHeader } from '@/components/DashboardClient/DashboardEventsHeader';
import { DashboardStats } from '@/components/DashboardClient/DashboardStats';
import { DashboardTabsHeader } from '@/components/DashboardClient/DashboardTabsHeader';
import { EventsTabPanel } from '@/components/DashboardClient/EventsTabPanel';
import { PageContainer } from '@/components/PageContainer';
import {
  DEFAULT_LICENSE_LEAD_DAYS,
  LICENSE_LEAD_KEY,
  WEEKDAY_LABELS,
} from '@/components/DashboardClient/constants';
import {
  buildDashboardCounts,
  buildDotCalendarDays,
  buildWardBreakdown,
  buildingToTab,
  getTodayYmd,
  isPastEvent,
  normalizeLicenseLeadDays,
  normalizeTab,
  tabToBuilding,
} from '@/components/DashboardClient/utils';
import type { DashboardClientProps, DashboardTab } from '@/components/DashboardClient/types';

const buildEventSearchHaystack = (event: EventWithCreator) =>
  [
    event.contactName,
    event.contactWard,
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
  const [searchQuery, setSearchQuery] = useState('');
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
    () =>
      buildDashboardCounts(
        stakeCenterEvents,
        maplesEvents,
        stakeUpcoming,
        maplesUpcoming,
        licenseLeadDays
      ),
    [licenseLeadDays, maplesEvents, maplesUpcoming, stakeCenterEvents, stakeUpcoming]
  );

  const activeBuildingKey = activeTab === 'maples-building' ? 'maples' : 'stake';
  const activeBuildingEvents = activeTab === 'maples-building' ? maplesEvents : stakeCenterEvents;
  const activeUpcoming = activeTab === 'maples-building' ? maplesUpcoming : stakeUpcoming;
  const activeBuildingName = activeTab === 'maples-building' ? 'Maples Building' : 'Stake Center';
  const activeBuildingSubtitle =
    activeTab === 'maples-building'
      ? 'All upcoming events at Maples Building'
      : 'All upcoming events at Stake Center';

  const wardBreakdown = useMemo(
    () => buildWardBreakdown(activeBuildingEvents, licenseLeadDays),
    [activeBuildingEvents, licenseLeadDays]
  );
  const wardBreakdownVisible = wardBreakdown.slice(0, 8);
  const wardBreakdownRemaining = Math.max(0, wardBreakdown.length - wardBreakdownVisible.length);

  const todayYmd = useMemo(() => getTodayYmd(), []);

  const dotCalendarDays = useMemo(
    () => buildDotCalendarDays(activeUpcoming, licenseLeadDays),
    [activeUpcoming, licenseLeadDays]
  );

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
    <PageContainer width="full" className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(normalizeTab(value))}
        className="space-y-4"
      >
        <DashboardTabsHeader
          stakeCount={stakeUpcoming.length}
          maplesCount={maplesUpcoming.length}
          searchValue={searchQuery}
          onSearchChangeAction={setSearchQuery}
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
          wardBreakdownVisible={wardBreakdownVisible}
          wardBreakdownRemaining={wardBreakdownRemaining}
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
            licenseLeadDays={licenseLeadDays}
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
            licenseLeadDays={licenseLeadDays}
            bulkDeletePending={bulkDeleteMaplesEvents.isPending}
            onOpenBulkDeleteAction={() => setBulkDeleteTarget('Maples Building')}
          />
        </TabsContent>
      </Tabs>

      <AddEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultBuilding={defaultBuilding}
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
