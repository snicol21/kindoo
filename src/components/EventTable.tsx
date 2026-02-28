'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertTriangle,
  Inbox,
  Trash2,
} from 'lucide-react';
import type { Event } from '@/schema/schema';

interface EventTableProps {
  events: Event[];
  isLoading: boolean;
  isError: boolean;
  building: string;
  onDelete?: (eventId: string) => Promise<void>;
}

type SortKey = 'name' | 'email' | 'createdAt';
type SortDir = 'asc' | 'desc';

export function EventTable({ events, isLoading, isError, building, onDelete }: EventTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<Event | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...events].sort((a, b) => {
    let valA: string | number | Date = a[sortKey] ?? '';
    let valB: string | number | Date = b[sortKey] ?? '';

    if (sortKey === 'createdAt') {
      valA = new Date(valA).getTime();
      valB = new Date(valB).getTime();
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }

    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const SortButton = ({ col, label }: { col: SortKey; label: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleSort(col)}
      className="-ml-3 h-8 gap-1 font-medium"
      aria-label={`Sort by ${label}`}
    >
      {label}
      <SortIcon col={col} />
    </Button>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading events…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm">Failed to load events. Please refresh.</p>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Inbox className="h-10 w-10 opacity-40" />
        <p className="font-medium">No events yet</p>
        <p className="text-sm text-center max-w-sm">
          Add your first event for {building} using the button above.
        </p>
      </div>
    );
  }

  const confirmDelete = async () => {
    if (!onDelete || !pendingDeleteEvent) return;
    setDeletingId(pendingDeleteEvent.id);
    try {
      await onDelete(pendingDeleteEvent.id);
      setPendingDeleteEvent(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton col="name" label="Name" />
              </TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>
                <SortButton col="email" label="Email" />
              </TableHead>
              <TableHead className="min-w-[200px]">Description</TableHead>
              <TableHead>
                <SortButton col="createdAt" label="Created" />
              </TableHead>
              <TableHead className="w-[80px]">Status</TableHead>
              <TableHead className="w-[90px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((event) => {
              const isOptimistic = event.id.startsWith('optimistic-');
              return (
                <TableRow key={event.id} className={isOptimistic ? 'opacity-60 animate-pulse' : ''}>
                  <TableCell className="font-medium whitespace-nowrap">{event.name}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {event.phone ? (
                      <a
                        href={`tel:${event.phone}`}
                        className="hover:text-foreground transition-colors"
                      >
                        {event.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <a href={`mailto:${event.email}`} className="text-primary hover:underline">
                      {event.email}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[300px]">
                    <p className="truncate" title={event.description}>
                      {event.description}
                    </p>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                    {isOptimistic ? (
                      <span className="text-muted-foreground/50">Saving…</span>
                    ) : (
                      new Date(event.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    )}
                  </TableCell>
                  <TableCell>
                    {isOptimistic ? (
                      <Badge variant="secondary" className="text-xs">
                        Pending
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Active
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${event.name}`}
                      disabled={isOptimistic || deletingId === event.id || !onDelete}
                      onClick={() => setPendingDeleteEvent(event)}
                    >
                      {deletingId === event.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!pendingDeleteEvent}
        onOpenChange={(open) => !open && setPendingDeleteEvent(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete event?</DialogTitle>
            <DialogDescription>
              {pendingDeleteEvent
                ? `This will permanently delete "${pendingDeleteEvent.name}".`
                : 'This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteEvent(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={!pendingDeleteEvent || deletingId === pendingDeleteEvent.id}
            >
              {pendingDeleteEvent && deletingId === pendingDeleteEvent.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
