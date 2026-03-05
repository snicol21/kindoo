'use client';

import { TabsList, TabsTrigger } from '@/components/_ui/tabs';
import { Building2 } from 'lucide-react';

type DashboardTabsHeaderProps = {
  stakeCount: number;
  maplesCount: number;
};

export function DashboardTabsHeader({ stakeCount, maplesCount }: DashboardTabsHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
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
    </div>
  );
}
