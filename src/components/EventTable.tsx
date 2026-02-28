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
  Copy,
} from 'lucide-react';
import { BUILDINGS, WARDS, type Building, type Ward } from '@/schema/schema';
import type { EventWithCreator, UpdateEventInput } from '@/actions/events';
import { toast } from 'sonner';

interface EventTableProps {
  events: EventWithCreator[];
  isLoading: boolean;
  isError: boolean;
  building: string;
  onDelete?: (eventId: string) => Promise<void>;
  onEdit?: (input: UpdateEventInput) => Promise<void>;
}

type SortKey = 'name' | 'email' | 'eventDate';
type SortDir = 'asc' | 'desc';

function parseYmd(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toLocalDate(dateStr: string) {
  const parsed = parseYmd(dateStr);
  if (parsed) {
    return new Date(parsed.year, parsed.month - 1, parsed.day);
  }
  const fallback = new Date(dateStr);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function toLocalDateTime(dateStr: string, timeStr: string) {
  const date = toLocalDate(dateStr);
  if (!date) return Number.NaN;
  const [hours, minutes] = timeStr.split(':').map((value) => Number(value));
  const safeHours = Number.isFinite(hours) ? hours : 0;
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  date.setHours(safeHours, safeMinutes, 0, 0);
  return date.getTime();
}

function formatPhone(value?: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length > 10) {
    normalized = normalized.slice(0, 10);
  }

  if (normalized.length <= 3) return normalized;
  if (normalized.length <= 6) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3)}`;
  }
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function formatDate(dateStr: string) {
  const date = toLocalDate(dateStr);
  if (!date) return dateStr;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timeStr: string) {
  const [hours, minutes] = timeStr.split(':').map((value) => Number(value));
  const dt = new Date();
  dt.setHours(hours, minutes, 0, 0);
  return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatTimeRange(startTime: string, endTime: string) {
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

function getDaysUntil(dateStr: string) {
  const parsed = parseYmd(dateStr);
  if (!parsed) return '—';

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  const diff = Math.floor((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'Past';
  if (diff === 0) return 'Today';
  if (diff === 1) return '1 day';
  return `${diff} days`;
}

function buildShortMessage(event: EventWithCreator) {
  const phone = formatPhone(event.phone);
  const date = formatDate(event.eventDate);
  const time = formatTimeRange(event.startTime, event.endTime);
  const contact = [event.name, phone].filter(Boolean).join(' ');
  return `Event at ${event.building} on ${date} ${time}. Contact: ${contact}. ${event.description}`;
}

function buildFullMessage(event: EventWithCreator) {
  const phone = formatPhone(event.phone);
  const contactLine = [event.name, phone, event.email].filter(Boolean).join(' | ');
  const creator = event.creatorName || event.creatorEmail || '—';

  return [
    `Event details: ${event.description}`,
    `Date: ${formatDate(event.eventDate)}`,
    `Time: ${formatTimeRange(event.startTime, event.endTime)}`,
    `Building: ${event.building}`,
    `Contact: ${contactLine || '—'}`,
    `Ward: ${event.ward ?? '—'}`,
    `Created by: ${creator}`,
  ].join('\n');
}

export function EventTable({
  events,
  isLoading,
  isError,
  building,
  onDelete,
  onEdit,
}: EventTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('eventDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<EventWithCreator | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventWithCreator | null>(null);
  const [copyingEvent, setCopyingEvent] = useState<EventWithCreator | null>(null);
  const [editBuilding, setEditBuilding] = useState<Building>('Stake Center');
  const [editName, setEditName] = useState('');
  const [editWard, setEditWard] = useState<Ward | ''>('');
  const [editEventDate, setEditEventDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
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

    if (sortKey === 'eventDate') {
      valA = toLocalDateTime(a.eventDate, a.startTime ?? '00:00');
      valB = toLocalDateTime(b.eventDate, b.startTime ?? '00:00');
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

  const openEditDialog = (event: EventWithCreator) => {
    setEditingEvent(event);
    setEditBuilding(event.building);
    setEditName(event.name);
    setEditWard(event.ward ?? '');
    setEditEventDate(event.eventDate);
    setEditStartTime(event.startTime);
    setEditEndTime(event.endTime);
    setEditPhone(formatPhone(event.phone ?? ''));
    setEditEmail(event.email);
    setEditDescription(event.description);
  };

  const submitEdit = async () => {
    if (!onEdit || !editingEvent) return;
    setIsSavingEdit(true);
    try {
      if (!editWard) {
        toast.error('Ward is required.');
        return;
      }
      await onEdit({
        id: editingEvent.id,
        building: editBuilding,
        ward: editWard as Ward,
        name: editName,
        eventDate: editEventDate,
        startTime: editStartTime,
        endTime: editEndTime,
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
              <TableHead>
                <SortButton col="eventDate" label="Date / Time" />
              </TableHead>
              <TableHead className="w-[110px]">Days Until</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>
                <SortButton col="email" label="Email" />
              </TableHead>
              <TableHead className="w-[140px]">Ward</TableHead>
              <TableHead className="w-[170px]">Created By</TableHead>
              <TableHead className="min-w-[220px]">Description</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((event) => {
              const isOptimistic = event.id.startsWith('optimistic-');
              return (
                <TableRow key={event.id} className={isOptimistic ? 'opacity-60 animate-pulse' : ''}>
                  <TableCell className="font-medium whitespace-nowrap">{event.name}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                    <div>{formatDate(event.eventDate)}</div>
                    <div>{formatTimeRange(event.startTime, event.endTime)}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {isOptimistic ? '—' : getDaysUntil(event.eventDate)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {event.phone ? (
                      <a
                        href={`tel:${event.phone.replace(/\D/g, '')}`}
                        className="hover:text-foreground transition-colors"
                      >
                        {formatPhone(event.phone)}
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
                  <TableCell className="text-muted-foreground">{event.ward ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {event.creatorName || event.creatorEmail || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[320px]">
                    <p className="truncate" title={event.description}>
                      {event.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Copy ${event.name}`}
                        disabled={isOptimistic}
                        onClick={() => setCopyingEvent(event)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
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
              <Label htmlFor="edit-name">Contact Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-ward">Ward</Label>
              <Select value={editWard} onValueChange={(value) => setEditWard(value as Ward)}>
                <SelectTrigger id="edit-ward">
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  {WARDS.map((ward) => (
                    <SelectItem key={ward} value={ward}>
                      {ward}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-event-date">Date</Label>
                <Input
                  id="edit-event-date"
                  type="date"
                  value={editEventDate}
                  onChange={(e) => setEditEventDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-start-time">Start</Label>
                <Input
                  id="edit-start-time"
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end-time">End</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(formatPhone(e.target.value))}
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

      <Dialog open={!!copyingEvent} onOpenChange={(open) => !open && setCopyingEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy event details</DialogTitle>
            <DialogDescription>Copy a formatted message to share.</DialogDescription>
          </DialogHeader>
          {copyingEvent && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Short message</Label>
                <Textarea readOnly rows={3} value={buildShortMessage(copyingEvent)} />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(buildShortMessage(copyingEvent));
                      toast.success('Short message copied.');
                    } catch {
                      toast.error('Failed to copy.');
                    }
                  }}
                >
                  Copy short message
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Full details</Label>
                <Textarea readOnly rows={7} value={buildFullMessage(copyingEvent)} />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(buildFullMessage(copyingEvent));
                      toast.success('Full details copied.');
                    } catch {
                      toast.error('Failed to copy.');
                    }
                  }}
                >
                  Copy full details
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyingEvent(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
