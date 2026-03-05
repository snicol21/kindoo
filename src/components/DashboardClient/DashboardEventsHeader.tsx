'use client';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CalendarDays, ChevronDown, Plus, Upload } from 'lucide-react';

type DashboardEventsHeaderProps = {
  title: string;
  subtitle: string;
  onAddEventAction: () => void;
  onImportCsvAction: () => void;
};

export function DashboardEventsHeader({
  title,
  subtitle,
  onAddEventAction,
  onImportCsvAction,
}: DashboardEventsHeaderProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            {title}
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </div>
        <div className="flex w-full flex-row flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
          <div className="flex w-full sm:w-auto">
            <Button onClick={onAddEventAction} className="flex-1 gap-2 rounded-r-none sm:flex-none">
              <Plus className="h-4 w-4" />
              Add Event
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="rounded-l-none border-l border-primary-foreground/30 px-3"
                  aria-label="More event actions"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={onImportCsvAction}>
                  <Upload className="h-4 w-4" />
                  Import CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}
