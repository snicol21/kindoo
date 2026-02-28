'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EventTable } from '@/components/EventTable';
import { AddEventDialog } from '@/components/AddEventDialog';
import { useDeleteEvent, useEvents, useUpdateEvent } from '@/hooks/useEvents';
import { Building2, Plus, CalendarDays } from 'lucide-react';
import type { Event, Building } from '@/schema/schema';

interface DashboardUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface DashboardClientProps {
  user: DashboardUser;
  initialStakeCenterEvents: Event[];
  initialMaplesEvents: Event[];
}

export function DashboardClient({
  user,
  initialStakeCenterEvents,
  initialMaplesEvents,
}: DashboardClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultBuilding, setDefaultBuilding] = useState<Building>('Stake Center');

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
  const updateEvent = useUpdateEvent();

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

        <Button onClick={() => openDialogFor('Stake Center')} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          Add Event
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Events</CardDescription>
            <CardTitle className="text-3xl">
              {stakeCenterEvents.length + maplesEvents.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Stake Center</CardDescription>
            <CardTitle className="text-3xl">{stakeCenterEvents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Maples Building</CardDescription>
            <CardTitle className="text-3xl">{maplesEvents.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="stake-center" className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="stake-center" className="gap-2">
              <Building2 className="h-4 w-4" />
              Stake Center
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {stakeCenterEvents.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="maples-building" className="gap-2">
              <Building2 className="h-4 w-4" />
              Maples Building
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
                {maplesEvents.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="stake-center">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  Stake Center Events
                </CardTitle>
                <CardDescription>All upcoming events at Stake Center</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDialogFor('Stake Center')}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              <EventTable
                events={stakeCenterEvents}
                isLoading={scLoading}
                isError={scError}
                building="Stake Center"
                onDelete={(eventId) =>
                  deleteStakeCenterEvent.mutateAsync(eventId).then(() => undefined)
                }
                onEdit={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maples-building">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  Maples Building Events
                </CardTitle>
                <CardDescription>All upcoming events at Maples Building</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDialogFor('Maples Building')}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </CardHeader>
            <CardContent>
              <EventTable
                events={maplesEvents}
                isLoading={mbLoading}
                isError={mbError}
                building="Maples Building"
                onDelete={(eventId) => deleteMaplesEvent.mutateAsync(eventId).then(() => undefined)}
                onEdit={(input) => updateEvent.mutateAsync(input).then(() => undefined)}
              />
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
    </div>
  );
}
