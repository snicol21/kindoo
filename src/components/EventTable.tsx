'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Loader2,
  AlertTriangle,
  Inbox,
  Pencil,
  Trash2,
  MessageSquare,
  CopyPlus,
  Mail,
  Phone,
  Church,
} from 'lucide-react';
import { BUILDINGS, WARDS, type Building, type Ward } from '@/schema/schema';
import type { AddEventInput, EventWithCreator, UpdateEventInput } from '@/actions/events';
import { toast } from 'sonner';

interface EventTableProps {
  events: EventWithCreator[];
  isLoading: boolean;
  isError: boolean;
  building: string;
  onDelete?: (eventId: string) => Promise<void>;
  onEdit?: (input: UpdateEventInput) => Promise<void>;
  onClone?: (input: AddEventInput) => Promise<void>;
  selectedIds?: string[];
  onSelectionChange?: (eventIds: string[]) => void;
}

type SortKey = 'name' | 'email' | 'eventDate' | 'daysUntil';
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

function formatDateNoYear(dateStr: string) {
  const date = toLocalDate(dateStr);
  if (!date) return dateStr;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
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

function getDaysUntilValue(dateStr: string) {
  const parsed = parseYmd(dateStr);
  if (!parsed) return Number.NaN;

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(parsed.year, parsed.month - 1, parsed.day);
  return Math.floor((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

function getFirstName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] || fullName;
}

function buildShortMessage(event: EventWithCreator) {
  const firstName = getFirstName(event.name);
  const date = formatDateNoYear(event.eventDate);
  const time = formatTimeRange(event.startTime, event.endTime);
  return `Hey ${firstName}, thanks for reaching out. Let me check the calendar to see if we have some availability for your private event (${event.description}) on ${date} (${time}) at the ${event.building}. I’ll follow up as soon as I confirm availability.`;
}

function buildFullMessage(event: EventWithCreator) {
  const firstName = getFirstName(event.name);
  const date = formatDateNoYear(event.eventDate);
  const time = formatTimeRange(event.startTime, event.endTime);
  return [
    `I was able to confirm availability for your private event on ${date} from ${time} at the ${event.building}.`,
    '',
    'We will need your email address that you use on your church membership record so we can issue your temporary Kindoo access.',
    '',
    'Also we require you to please review the Stake Meetinghouse Use Policies here:',
    'https://drive.google.com/file/d/1LBukeaPHsg8eB-EtAyXXiPbq--o7wV1h/view?usp=sharing',
    '',
    `Thanks, ${firstName}!`,
  ].join('\n');
}

function buildCalendarItemDescription(event: EventWithCreator) {
  const phone = formatPhone(event.phone);
  const lines = [
    `Member: ${event.name}`,
    `Event details: ${event.description}`,
    `Ward: ${event.ward ?? '—'}`,
    `Phone: ${phone || '—'}`,
  ];

  if (event.email?.trim()) {
    lines.push(`Email: ${event.email}`);
  }

  return lines.join('\n');
}

export function EventTable({
  events,
  isLoading,
  isError,
  building,
  onDelete,
  onEdit,
  onClone,
  selectedIds,
  onSelectionChange,
}: EventTableProps) {
  const PAGE_SIZE = 10;

  const [sortKey, setSortKey] = useState<SortKey>('eventDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<EventWithCreator | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventWithCreator | null>(null);
  const [cloningEvent, setCloningEvent] = useState<EventWithCreator | null>(null);
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
  const [cloneBuilding, setCloneBuilding] = useState<Building>('Stake Center');
  const [cloneName, setCloneName] = useState('');
  const [cloneWard, setCloneWard] = useState<Ward | ''>('');
  const [cloneEventDate, setCloneEventDate] = useState('');
  const [cloneStartTime, setCloneStartTime] = useState('');
  const [cloneEndTime, setCloneEndTime] = useState('');
  const [clonePhone, setClonePhone] = useState('');
  const [cloneEmail, setCloneEmail] = useState('');
  const [cloneDescription, setCloneDescription] = useState('');
  const [isSavingClone, setIsSavingClone] = useState(false);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());

  const selectedIdSet = useMemo(
    () => new Set(selectedIds ?? Array.from(internalSelectedIds)),
    [selectedIds, internalSelectedIds]
  );

  const selectableEvents = useMemo(
    () => events.filter((event) => !event.id.startsWith('optimistic-')),
    [events]
  );

  const applySelection = (next: Set<string>) => {
    if (onSelectionChange) {
      onSelectionChange(Array.from(next));
      return;
    }
    setInternalSelectedIds(next);
  };

  useEffect(() => {
    const next = new Set<string>();
    for (const event of selectableEvents) {
      if (selectedIdSet.has(event.id)) next.add(event.id);
    }

    if (next.size !== selectedIdSet.size || Array.from(next).some((id) => !selectedIdSet.has(id))) {
      applySelection(next);
    }
  }, [selectableEvents, selectedIdSet]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = [...events].sort((a, b) => {
    let valA: string | number = '';
    let valB: string | number = '';

    if (sortKey === 'eventDate') {
      valA = toLocalDateTime(a.eventDate, a.startTime ?? '00:00');
      valB = toLocalDateTime(b.eventDate, b.startTime ?? '00:00');
    } else if (sortKey === 'daysUntil') {
      valA = getDaysUntilValue(a.eventDate);
      valB = getDaysUntilValue(b.eventDate);
    } else if (sortKey === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (sortKey === 'email') {
      valA = a.email.toLowerCase();
      valB = b.email.toLowerCase();
    }

    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [building]);

  const pageStartIndex = (currentPage - 1) * PAGE_SIZE;
  const pageEndIndex = pageStartIndex + PAGE_SIZE;
  const pagedEvents = sorted.slice(pageStartIndex, pageEndIndex);

  const selectablePageEvents = useMemo(
    () => pagedEvents.filter((event) => !event.id.startsWith('optimistic-')),
    [pagedEvents]
  );
  const allSelected =
    selectablePageEvents.length > 0 &&
    selectablePageEvents.every((event) => selectedIdSet.has(event.id));

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
    setEditEmail(event.email ?? '');
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

  const handleRowClick = (
    event: MouseEvent<HTMLTableRowElement>,
    rowEvent: EventWithCreator,
    isOptimisticRow: boolean
  ) => {
    if (!onEdit || isOptimisticRow) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, textarea, select, [data-no-row-click]')) return;
    openEditDialog(rowEvent);
  };

  const openCloneDialog = (event: EventWithCreator) => {
    setCloningEvent(event);
    setCloneBuilding(event.building);
    setCloneName(event.name);
    setCloneWard(event.ward ?? '');
    setCloneEventDate(event.eventDate);
    setCloneStartTime(event.startTime);
    setCloneEndTime(event.endTime);
    setClonePhone(formatPhone(event.phone ?? ''));
    setCloneEmail(event.email ?? '');
    setCloneDescription(event.description);
  };

  const submitClone = async () => {
    if (!onClone || !cloningEvent) return;
    if (!cloneName.trim()) {
      toast.error('Name is required.');
      return;
    }
    if (!cloneWard) {
      toast.error('Ward is required.');
      return;
    }
    if (!cloneEventDate.trim()) {
      toast.error('Event date is required.');
      return;
    }
    if (!cloneStartTime.trim() || !cloneEndTime.trim()) {
      toast.error('Start and end times are required.');
      return;
    }
    if (!cloneDescription.trim()) {
      toast.error('Description is required.');
      return;
    }

    setIsSavingClone(true);
    try {
      await onClone({
        building: cloneBuilding,
        ward: cloneWard as Ward,
        name: cloneName.trim(),
        eventDate: cloneEventDate,
        startTime: cloneStartTime,
        endTime: cloneEndTime,
        phone: clonePhone,
        email: cloneEmail,
        description: cloneDescription.trim(),
      });
      setCloningEvent(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clone event.');
    } finally {
      setIsSavingClone(false);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader className="[&_th]:text-xs">
            <TableRow>
              <TableHead className="w-[36px]">
                <input
                  type="checkbox"
                  aria-label="Select all events"
                  checked={allSelected}
                  onChange={(event) => {
                    if (event.target.checked) {
                      const next = new Set(selectedIdSet);
                      for (const selectableEvent of selectablePageEvents) {
                        next.add(selectableEvent.id);
                      }
                      applySelection(next);
                    } else {
                      const next = new Set(selectedIdSet);
                      for (const selectableEvent of selectablePageEvents) {
                        next.delete(selectableEvent.id);
                      }
                      applySelection(next);
                    }
                  }}
                />
              </TableHead>
              <TableHead className="w-[110px]">
                <SortButton col="daysUntil" label="Days Until" />
              </TableHead>
              <TableHead className="min-w-[260px]">
                <SortButton col="eventDate" label="Event" />
              </TableHead>
              <TableHead className="w-[240px]">
                <SortButton col="name" label="Member" />
              </TableHead>
              <TableHead className="w-[240px]">Member Contact</TableHead>
              <TableHead className="w-[140px]">Created</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedEvents.map((event) => {
              const isOptimistic = event.id.startsWith('optimistic-');
              return (
                <TableRow
                  key={event.id}
                  onClick={(e) => handleRowClick(e, event, isOptimistic)}
                  className={`${isOptimistic ? 'opacity-60 animate-pulse' : ''} ${
                    !isOptimistic && onEdit ? 'cursor-pointer hover:bg-muted/40' : ''
                  }`}
                >
                  <TableCell className="w-[36px]">
                    <input
                      type="checkbox"
                      aria-label={`Select ${event.name}`}
                      disabled={isOptimistic}
                      checked={selectedIdSet.has(event.id)}
                      onChange={(e) => {
                        const next = new Set(selectedIdSet);
                        if (e.target.checked) {
                          next.add(event.id);
                        } else {
                          next.delete(event.id);
                        }
                        applySelection(next);
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-foreground text-sm">
                    {isOptimistic ? '—' : getDaysUntil(event.eventDate)}
                  </TableCell>
                  <TableCell>
                    <div className="text-foreground text-sm">{formatDate(event.eventDate)}</div>
                    <div className="text-muted-foreground text-xs">
                      {formatTimeRange(event.startTime, event.endTime)}
                    </div>
                    <p
                      className="text-muted-foreground text-xs line-clamp-2"
                      title={event.description}
                    >
                      {event.description}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[360px]">
                    <div className="space-y-1.5">
                      <div className="truncate text-foreground" title={event.name}>
                        {event.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Church className="h-3.5 w-3.5 shrink-0" />
                        <span>{event.ward ?? '—'}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        {event.email ? (
                          <a
                            href={`mailto:${event.email}`}
                            className="truncate hover:text-foreground hover:underline"
                            title={event.email}
                          >
                            {event.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {event.phone ? (
                          <a
                            href={`tel:${event.phone.replace(/\D/g, '')}`}
                            className="truncate hover:text-foreground hover:underline"
                            title={formatPhone(event.phone)}
                          >
                            {formatPhone(event.phone)}
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-sm">
                    {isOptimistic ? (
                      '—'
                    ) : (
                      <div>
                        <div className="text-foreground text-xs">
                          {event.creatorName || event.creatorEmail || '—'}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {new Date(event.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Copy ${event.name}`}
                            disabled={isOptimistic}
                            onClick={() => setCopyingEvent(event)}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Message templates</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Clone ${event.name}`}
                            disabled={isOptimistic || !onClone}
                            onClick={() => openCloneDialog(event)}
                          >
                            <CopyPlus className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Clone event</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${event.name}`}
                            disabled={isOptimistic || !onEdit}
                            onClick={() => openEditDialog(event)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Edit event</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
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
                        </TooltipTrigger>
                        <TooltipContent>Delete event</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <div>
          Showing {sorted.length === 0 ? 0 : pageStartIndex + 1}–
          {Math.min(pageEndIndex, sorted.length)} of {sorted.length} events
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
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
              <Label htmlFor="edit-name">Member Name</Label>
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

      <Dialog open={!!cloningEvent} onOpenChange={(open) => !open && setCloningEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clone event</DialogTitle>
            <DialogDescription>Adjust the details and save as a new event.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="clone-building">Building</Label>
              <Select
                value={cloneBuilding}
                onValueChange={(value) => setCloneBuilding(value as Building)}
              >
                <SelectTrigger id="clone-building">
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
              <Label htmlFor="clone-name">Member Name</Label>
              <Input
                id="clone-name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-ward">Ward</Label>
              <Select value={cloneWard} onValueChange={(value) => setCloneWard(value as Ward)}>
                <SelectTrigger id="clone-ward">
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
                <Label htmlFor="clone-event-date">Date</Label>
                <Input
                  id="clone-event-date"
                  type="date"
                  value={cloneEventDate}
                  onChange={(e) => setCloneEventDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clone-start-time">Start</Label>
                <Input
                  id="clone-start-time"
                  type="time"
                  value={cloneStartTime}
                  onChange={(e) => setCloneStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clone-end-time">End</Label>
                <Input
                  id="clone-end-time"
                  type="time"
                  value={cloneEndTime}
                  onChange={(e) => setCloneEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-phone">Phone</Label>
              <Input
                id="clone-phone"
                type="tel"
                value={clonePhone}
                onChange={(e) => setClonePhone(formatPhone(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-email">Email</Label>
              <Input
                id="clone-email"
                type="email"
                value={cloneEmail}
                onChange={(e) => setCloneEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clone-description">Description</Label>
              <Textarea
                id="clone-description"
                rows={4}
                value={cloneDescription}
                onChange={(e) => setCloneDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloningEvent(null)}>
              Cancel
            </Button>
            <Button onClick={submitClone} disabled={!cloningEvent || isSavingClone || !onClone}>
              {isSavingClone ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save new event'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!copyingEvent} onOpenChange={(open) => !open && setCopyingEvent(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Message templates</DialogTitle>
            <DialogDescription>Copy a formatted message to share.</DialogDescription>
          </DialogHeader>
          {copyingEvent && (
            <div className="space-y-4">
              {(copyingEvent.email?.trim() || copyingEvent.phone?.trim()) && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {copyingEvent.email?.trim() && (
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input readOnly value={copyingEvent.email} />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(copyingEvent.email ?? '');
                              toast.success('Email copied.');
                            } catch {
                              toast.error('Failed to copy.');
                            }
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                  {copyingEvent.phone?.trim() && (
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input readOnly value={formatPhone(copyingEvent.phone)} />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(formatPhone(copyingEvent.phone));
                              toast.success('Phone copied.');
                            } catch {
                              toast.error('Failed to copy.');
                            }
                          }}
                        >
                          Copy
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex h-full flex-col gap-2">
                  <Label>Availability inquiry text</Label>
                  <Textarea
                    readOnly
                    rows={4}
                    className="flex-1 min-h-[140px]"
                    value={buildShortMessage(copyingEvent)}
                  />
                  <Button
                    variant="outline"
                    className="self-start"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(buildShortMessage(copyingEvent));
                        toast.success('Availability inquiry text copied.');
                      } catch {
                        toast.error('Failed to copy.');
                      }
                    }}
                  >
                    Copy Message
                  </Button>
                </div>
                <div className="flex h-full flex-col gap-2">
                  <Label>Calendar item description</Label>
                  <Textarea
                    readOnly
                    rows={6}
                    className="flex-1 min-h-[140px]"
                    value={buildCalendarItemDescription(copyingEvent)}
                  />
                  <Button
                    variant="outline"
                    className="self-start"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          buildCalendarItemDescription(copyingEvent)
                        );
                        toast.success('Calendar item description copied.');
                      } catch {
                        toast.error('Failed to copy.');
                      }
                    }}
                  >
                    Copy Message
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Availability confirmed + policy text</Label>
                <Textarea readOnly rows={9} value={buildFullMessage(copyingEvent)} />
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(buildFullMessage(copyingEvent));
                      toast.success('Availability confirmed + policy text copied.');
                    } catch {
                      toast.error('Failed to copy.');
                    }
                  }}
                >
                  Copy Message
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
    </TooltipProvider>
  );
}
