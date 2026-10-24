'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import { TabsList, TabsTrigger } from '@/components/_ui/tabs';
import {
  EVENT_STATUS_FILTERS,
  EVENT_STATUS_FILTER_LABELS,
  type EventStatusFilter,
} from '@/components/DashboardClient/utils';
import { SearchInput } from '@/components/SearchInput';
import { Building2 } from 'lucide-react';

type DashboardTabsHeaderProps = {
  stakeCount: number;
  maplesCount: number;
  searchValue: string;
  onSearchChangeAction: (value: string) => void;
  statusFilter: EventStatusFilter;
  onStatusFilterChangeAction: (value: EventStatusFilter) => void;
  canToggleBuildings?: boolean;
  fixedBuildingLabel?: 'Stake Center' | 'Maples Building';
};

export function DashboardTabsHeader({
  stakeCount,
  maplesCount,
  searchValue,
  onSearchChangeAction,
  statusFilter,
  onStatusFilterChangeAction,
  canToggleBuildings = true,
  fixedBuildingLabel,
}: DashboardTabsHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {canToggleBuildings ? (
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="stake-center" className="flex-1 gap-2 sm:flex-none">
            <Building2 className="hidden h-4 w-4 sm:inline-block" />
            Stake Center
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
              {stakeCount}
            </span>
          </TabsTrigger>
          <TabsTrigger value="maples-building" className="flex-1 gap-2 sm:flex-none">
            <Building2 className="hidden h-4 w-4 sm:inline-block" />
            Maples Building
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
              {maplesCount}
            </span>
          </TabsTrigger>
        </TabsList>
      ) : (
        <div className="inline-flex w-full items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm font-medium sm:w-auto">
          <Building2 className="h-4 w-4" />
          {fixedBuildingLabel ?? 'Assigned Building'}
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
            {fixedBuildingLabel === 'Maples Building' ? maplesCount : stakeCount}
          </span>
        </div>
      )}
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <Select
          value={statusFilter}
          onValueChange={(value) => onStatusFilterChangeAction(value as EventStatusFilter)}
        >
          <SelectTrigger aria-label="Filter by status" className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {EVENT_STATUS_FILTER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput
          value={searchValue}
          onValueChangeAction={onSearchChangeAction}
          placeholder="Search events"
          className="w-full sm:w-64"
        />
      </div>
    </div>
  );
}
