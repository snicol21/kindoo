'use client';

import { TabsList, TabsTrigger } from '@/components/_ui/tabs';
import { Building2 } from 'lucide-react';
import { SearchInput } from '@/components/SearchInput';

type DashboardTabsHeaderProps = {
  stakeCount: number;
  maplesCount: number;
  searchValue: string;
  onSearchChangeAction: (value: string) => void;
  canToggleBuildings?: boolean;
  fixedBuildingLabel?: 'Stake Center' | 'Maples Building';
};

export function DashboardTabsHeader({
  stakeCount,
  maplesCount,
  searchValue,
  onSearchChangeAction,
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
      <SearchInput
        value={searchValue}
        onValueChangeAction={onSearchChangeAction}
        placeholder="Search events"
        className="w-full sm:w-64"
      />
    </div>
  );
}
