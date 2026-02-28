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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertTriangle,
  Inbox,
  Pencil,
  Trash2,
} from 'lucide-react';
import { BUILDINGS, type Building, type Event } from '@/schema/schema';
import type { UpdateEventInput } from '@/actions/events';

interface EventTableProps {
  events: Event[];
  isLoading: boolean;
  isError: boolean;
  building: string;
  onDelete?: (eventId: string) => Promise<void>;
  onEdit?: (input: UpdateEventInput) => Promise<void>;
}

type SortKey = 'name' | 'email' | 'createdAt';
type SortDir = 'asc' | 'desc';

export function EventTable({
  events,
  isLoading,
  isError,
  building,
  onDelete,
  onEdit,
}: EventTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<Event | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editBuilding, setEditBuilding] = useState<Building>('Stake Center');
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

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

  const openEditDialog = (event: Event) => {
    setEditingEvent(event);
    setEditBuilding(event.building);
    setEditName(event.name);
    setEditPhone(event.phone ?? '');
    setEditEmail(event.email);
    setEditDescription(event.description);
  };

  const submitEdit = async () => {
    if (!onEdit || !editingEvent) return;
    setIsSavingEdit(true);
    try {
      await onEdit({
        id: editingEvent.id,
        building: editBuilding,
        name: editName,
        phone: editPhone,
        email: editEmail,
        description: editDescription,
      });
      setEditingEvent(null);
    } finally {
      setIsSavingEdit(false);
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
              <TableHead className="w-[120px]">Actions</TableHead>
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
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${event.name}`}
                        disabled={isOptimistic || !onEdit}
                        onClick={() => openEditDialog(event)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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
                    </div>
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

      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit event</DialogTitle>
            <DialogDescription>Update the event details and save your changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-building">Building</Label>
              <Select
                value={editBuilding}
                onValueChange={(value) => setEditBuilding(value as Building)}
              >
                <SelectTrigger id="edit-building">
                  <SelectValue placeholder="Select building" />
                </SelectTrigger>
                <SelectContent>
                  {BUILDINGS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                rows={4}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEvent(null)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={!editingEvent || isSavingEdit || !onEdit}>
              {isSavingEdit ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
