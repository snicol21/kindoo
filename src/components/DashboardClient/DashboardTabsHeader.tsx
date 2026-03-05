'use client';

import { TabsList, TabsTrigger } from '@/components/_ui/tabs';
import { Building2 } from 'lucide-react';
import { SearchInput } from '@/components/SearchInput';

type DashboardTabsHeaderProps = {
  stakeCount: number;
  maplesCount: number;
  searchValue: string;
  onSearchChangeAction: (value: string) => void;
};

export function DashboardTabsHeader({
  stakeCount,
  maplesCount,
  searchValue,
  onSearchChangeAction,
}: DashboardTabsHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <TabsList className="w-full sm:w-auto">
        <TabsTrigger value="stake-center" className="flex-1 gap-2 sm:flex-none">
          <Building2 className="hidden h-4 w-4 sm:inline-block" />
          Stake Center
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">{stakeCount}</span>
        </TabsTrigger>
        <TabsTrigger value="maples-building" className="flex-1 gap-2 sm:flex-none">
          <Building2 className="hidden h-4 w-4 sm:inline-block" />
          Maples Building
          <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">{maplesCount}</span>
        </TabsTrigger>
      </TabsList>
      <SearchInput
        value={searchValue}
        onValueChangeAction={onSearchChangeAction}
        placeholder="Search events"
        className="w-full sm:w-64"
      />
    </div>
  );
}
