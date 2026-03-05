'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  Copy,
  CopyPlus,
  Mail,
  Phone,
  Church,
  Clock,
  FileText,
  CheckCircle2,
  MoreVertical,
} from 'lucide-react';
import type { EventWithCreator } from '@/actions/events';
import { toast } from 'sonner';
import { CloneEventDialog } from '@/components/EventTable/CloneEventDialog';
import { DeleteEventDialog } from '@/components/EventTable/DeleteEventDialog';
import { EditEventDialog } from '@/components/EventTable/EditEventDialog';
import { EventMessagesDialog } from '@/components/EventTable/EventMessagesDialog';
import { KindooLicenseDialog } from '@/components/EventTable/KindooLicenseDialog';
import type { EventTableProps, SortDir, SortKey } from '@/components/EventTable/types';
import type { Building, Ward } from '@/schema/schema';
import { formatDate, getDaysUntil, getDaysUntilValue, toLocalDateTime } from '@/utils/dateUtils';
import { getLicenseTimes, renderMessageTemplate } from '@/utils/eventTemplateUtils';
import { DESCRIPTION_MAX_LENGTH } from '@/utils/eventConstants';
import { formatPhone } from '@/utils/phoneUtils';
import { formatTimeRange, validateTimeWindow } from '@/utils/timeUtils';

export function EventTable({
  events,
  isLoading,
  isError,
  building,
  messageTemplates,
  onDelete,
  onEdit,
  onClone,
  onSetKindooLicenseCreated,
  licenseLeadDays,
  selectedIds,
  onSelectionChange,
}: EventTableProps) {
  // Adjust this value to control when the table collapses from Event+Member to Event-only.
  const SINGLE_COLUMN_MAX_WIDTH = 639;
  const PAGE_SIZE = 10;
  const effectiveLeadDays = Number.isFinite(licenseLeadDays)
    ? Math.max(0, licenseLeadDays as number)
    : 2;

  const [sortKey, setSortKey] = useState<SortKey>('eventDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<EventWithCreator | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventWithCreator | null>(null);
  const [licenseEvent, setLicenseEvent] = useState<EventWithCreator | null>(null);
  const [isSavingLicenseStatus, setIsSavingLicenseStatus] = useState(false);
  const submitKindooLicenseStatus = async (event: EventWithCreator, nextValue: boolean) => {
    if (!onSetKindooLicenseCreated || isSavingLicenseStatus) return;
    const previousValue = !!event.kindooLicenseCreated;
    setLicenseEvent((prev) =>
      prev && prev.id === event.id ? { ...prev, kindooLicenseCreated: nextValue } : prev
    );
    setIsSavingLicenseStatus(true);
    try {
      await onSetKindooLicenseCreated({
        eventId: event.id,
        kindooLicenseCreated: nextValue,
      });
    } catch {
      setLicenseEvent((prev) =>
        prev && prev.id === event.id ? { ...prev, kindooLicenseCreated: previousValue } : prev
      );
      toast.error('Failed to update license status.');
    } finally {
      setIsSavingLicenseStatus(false);
    }
  };

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
  const [isCompactView, setIsCompactView] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isSingleColumnView, setIsSingleColumnView] = useState(false);

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

  useEffect(() => {
    const compactQuery = window.matchMedia('(max-width: 1023px)');
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const singleColumnQuery = window.matchMedia(`(max-width: ${SINGLE_COLUMN_MAX_WIDTH}px)`);
    const syncBreakpoints = () => {
      setIsCompactView(compactQuery.matches);
      setIsMobileView(mobileQuery.matches);
      setIsSingleColumnView(singleColumnQuery.matches);
    };

    syncBreakpoints();

    if (
      typeof compactQuery.addEventListener === 'function' &&
      typeof mobileQuery.addEventListener === 'function' &&
      typeof singleColumnQuery.addEventListener === 'function'
    ) {
      compactQuery.addEventListener('change', syncBreakpoints);
      mobileQuery.addEventListener('change', syncBreakpoints);
      singleColumnQuery.addEventListener('change', syncBreakpoints);
      return () => {
        compactQuery.removeEventListener('change', syncBreakpoints);
        mobileQuery.removeEventListener('change', syncBreakpoints);
        singleColumnQuery.removeEventListener('change', syncBreakpoints);
      };
    }

    compactQuery.addListener(syncBreakpoints);
    mobileQuery.addListener(syncBreakpoints);
    singleColumnQuery.addListener(syncBreakpoints);
    return () => {
      compactQuery.removeListener(syncBreakpoints);
      mobileQuery.removeListener(syncBreakpoints);
      singleColumnQuery.removeListener(syncBreakpoints);
    };
  }, [SINGLE_COLUMN_MAX_WIDTH]);

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

  const SortButton = ({
    col,
    label,
    className,
  }: {
    col: SortKey;
    label: string;
    className?: string;
  }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleSort(col)}
      className={`-ml-3 h-8 gap-1 font-medium ${className ?? ''}`}
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
      const timeError = validateTimeWindow(editStartTime, editEndTime);
      if (timeError) {
        toast.error(timeError);
        return;
      }
      if (editDescription.trim().length > DESCRIPTION_MAX_LENGTH) {
        toast.error(`Description must be ${DESCRIPTION_MAX_LENGTH} characters or less.`);
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
    const timeError = validateTimeWindow(cloneStartTime, cloneEndTime);
    if (timeError) {
      toast.error(timeError);
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
    if (cloneDescription.trim().length > DESCRIPTION_MAX_LENGTH) {
      toast.error(`Description must be ${DESCRIPTION_MAX_LENGTH} characters or less.`);
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
      <div
        className={`rounded-t-md rounded-b-none border-b ${
          isCompactView ? 'overflow-hidden' : 'overflow-x-auto'
        }`}
      >
        <Table
          className={`${
            isMobileView
              ? 'table-fixed [&_th]:px-2 [&_td]:px-2 [&_th]:py-1.5 [&_td]:py-1.5'
              : isCompactView
                ? 'table-auto [&_th]:px-3 [&_td]:px-3 [&_th]:py-2 [&_td]:py-2'
                : 'table-auto [&_th]:px-2 [&_td]:px-2 [&_th]:py-2 [&_td]:py-2'
          }`}
        >
          <TableHeader className="[&_th]:text-xs">
            <TableRow>
              <TableHead className="w-9">
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
              <TableHead
                className={isCompactView && !isSingleColumnView ? 'w-1/2' : 'min-w-0 sm:min-w-50'}
              >
                <SortButton col="eventDate" label="Event" />
              </TableHead>
              {!isSingleColumnView && (
                <TableHead className={isCompactView ? 'w-1/2' : 'w-60'}>
                  <SortButton col="name" label="Member" />
                </TableHead>
              )}
              {!isCompactView && (
                <>
                  <TableHead className="w-60">Member Contact</TableHead>
                  <TableHead className="w-35">Created</TableHead>
                  <TableHead className="w-30">Actions</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedEvents.map((event) => {
              const isOptimistic = event.id.startsWith('optimistic-');
              const daysValue = getDaysUntilValue(event.eventDate);
              const withinWindow =
                Number.isFinite(daysValue) && daysValue >= 0 && daysValue <= effectiveLeadDays;
              const isCompleted = !!event.kindooLicenseCreated;
              return (
                <TableRow
                  key={event.id}
                  className={isOptimistic ? 'opacity-60 animate-pulse' : undefined}
                >
                  <TableCell className="w-9">
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
                  <TableCell
                    className={`min-w-0 align-top ${isCompactView && !isSingleColumnView ? 'w-1/2' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-foreground text-sm font-semibold">
                            {formatDate(event.eventDate)}
                          </div>
                          {!isOptimistic && (
                            <div className="text-muted-foreground text-xs">
                              ({getDaysUntil(event.eventDate)})
                            </div>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span>{formatTimeRange(event.startTime, event.endTime)}</span>
                        </div>
                        <p
                          className="mt-1 flex items-start gap-1.5 text-muted-foreground text-xs line-clamp-2"
                          title={event.description}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0">{event.description}</span>
                        </p>
                        {!isSingleColumnView && !isOptimistic && withinWindow && !isCompleted && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={`mt-1.5 h-5 px-1.5 text-[10px] sm:h-6 sm:px-2 sm:text-[11px] ${
                              withinWindow
                                ? 'border-yellow-400 bg-yellow-400 text-black hover:bg-yellow-500 hover:border-yellow-500'
                                : ''
                            }`}
                            onClick={() => setLicenseEvent(event)}
                          >
                            Kindoo License
                          </Button>
                        )}
                        {!isSingleColumnView && !isOptimistic && isCompleted && (
                          <button
                            type="button"
                            className="mt-1.5 inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed"
                            onClick={() => setLicenseEvent(event)}
                            disabled={!onSetKindooLicenseCreated || isSavingLicenseStatus}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="underline underline-offset-2">License created</span>
                          </button>
                        )}
                      </div>
                      {isSingleColumnView && (
                        <div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 border border-border bg-secondary/60 text-foreground hover:bg-secondary"
                                aria-label={`Actions for ${event.name}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                disabled={isOptimistic}
                                onSelect={() => setCopyingEvent(event)}
                              >
                                <MessageSquare className="h-4 w-4" />
                                Event messages
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isOptimistic || !onClone}
                                onSelect={() => openCloneDialog(event)}
                              >
                                <CopyPlus className="h-4 w-4" />
                                Clone event
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isOptimistic || !onEdit}
                                onSelect={() => openEditDialog(event)}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit event
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={isOptimistic || deletingId === event.id || !onDelete}
                                onSelect={() => setPendingDeleteEvent(event)}
                              >
                                {deletingId === event.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                                Delete event
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                    {isSingleColumnView && (
                      <div className="mt-2 space-y-2">
                        <div className="flex flex-wrap items-baseline gap-1">
                          <div
                            className="truncate text-foreground text-sm font-semibold"
                            title={event.name}
                          >
                            {event.name}
                          </div>
                          <span className="text-muted-foreground text-xs">
                            ({event.ward ?? '—'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {event.email ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`mailto:${event.email}`}
                                className="max-w-44 truncate text-muted-foreground hover:underline"
                                title={event.email}
                              >
                                {event.email}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                aria-label={`Copy email for ${event.name}`}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(event.email ?? '');
                                    toast.success('Email copied.');
                                  } catch {
                                    toast.error('Failed to copy.');
                                  }
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {event.phone ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`tel:${event.phone.replace(/\D/g, '')}`}
                                className="max-w-44 truncate hover:text-foreground hover:underline"
                                title={formatPhone(event.phone)}
                              >
                                {formatPhone(event.phone)}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                aria-label={`Copy phone for ${event.name}`}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(event.phone ?? '');
                                    toast.success('Phone copied.');
                                  } catch {
                                    toast.error('Failed to copy.');
                                  }
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </div>
                        {!isOptimistic && withinWindow && !isCompleted && (
                          <Button
                            variant="outline"
                            size="sm"
                            className={`h-5 px-1.5 text-[10px] ${
                              withinWindow
                                ? 'border-yellow-400 bg-yellow-400 text-black hover:bg-yellow-500 hover:border-yellow-500'
                                : ''
                            }`}
                            onClick={() => setLicenseEvent(event)}
                          >
                            Kindoo License
                          </Button>
                        )}
                        {!isOptimistic && isCompleted && (
                          <button
                            type="button"
                            className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed"
                            onClick={() => setLicenseEvent(event)}
                            disabled={!onSetKindooLicenseCreated || isSavingLicenseStatus}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="underline underline-offset-2">License created</span>
                          </button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  {isCompactView && !isSingleColumnView && (
                    <TableCell className="w-1/2 align-top">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <div
                            className="truncate text-foreground text-sm font-semibold"
                            title={event.name}
                          >
                            {event.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Church className="h-3.5 w-3.5 shrink-0" />
                            <span>{event.ward ?? '—'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            {event.email ? (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <a
                                  href={`mailto:${event.email}`}
                                  className="max-w-44 truncate text-muted-foreground hover:underline"
                                  title={event.email}
                                >
                                  {event.email}
                                </a>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0"
                                  aria-label={`Copy email for ${event.name}`}
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(event.email ?? '');
                                      toast.success('Email copied.');
                                    } catch {
                                      toast.error('Failed to copy.');
                                    }
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            {event.phone ? (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <a
                                  href={`tel:${event.phone.replace(/\D/g, '')}`}
                                  className="max-w-44 truncate hover:text-foreground hover:underline"
                                  title={formatPhone(event.phone)}
                                >
                                  {formatPhone(event.phone)}
                                </a>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0"
                                  aria-label={`Copy phone for ${event.name}`}
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(event.phone ?? '');
                                      toast.success('Phone copied.');
                                    } catch {
                                      toast.error('Failed to copy.');
                                    }
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 border border-border bg-secondary/60 text-foreground hover:bg-secondary"
                              aria-label={`Actions for ${event.name}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              disabled={isOptimistic}
                              onSelect={() => setCopyingEvent(event)}
                            >
                              <MessageSquare className="h-4 w-4" />
                              Event messages
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isOptimistic || !onClone}
                              onSelect={() => openCloneDialog(event)}
                            >
                              <CopyPlus className="h-4 w-4" />
                              Clone event
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isOptimistic || !onEdit}
                              onSelect={() => openEditDialog(event)}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit event
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={isOptimistic || deletingId === event.id || !onDelete}
                              onSelect={() => setPendingDeleteEvent(event)}
                            >
                              {deletingId === event.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              Delete event
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  )}
                  {!isCompactView && (
                    <TableCell className="max-w-90 align-top">
                      <div className="space-y-1.5">
                        <div
                          className="truncate text-foreground text-sm font-semibold"
                          title={event.name}
                        >
                          {event.name}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Church className="h-3.5 w-3.5 shrink-0" />
                          <span>{event.ward ?? '—'}</span>
                        </div>
                      </div>
                    </TableCell>
                  )}
                  {!isCompactView && (
                    <TableCell className="max-w-70 align-top">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {event.email ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`mailto:${event.email}`}
                                className="truncate cursor-pointer text-muted-foreground hover:underline"
                                title={event.email}
                              >
                                {event.email}
                              </a>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    aria-label={`Copy email for ${event.name}`}
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(event.email ?? '');
                                        toast.success('Email copied.');
                                      } catch {
                                        toast.error('Failed to copy.');
                                      }
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy email</TooltipContent>
                              </Tooltip>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {event.phone ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`tel:${event.phone.replace(/\D/g, '')}`}
                                className="truncate cursor-pointer hover:text-foreground hover:underline"
                                title={formatPhone(event.phone)}
                              >
                                {formatPhone(event.phone)}
                              </a>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    aria-label={`Copy phone for ${event.name}`}
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(
                                          formatPhone(event.phone)
                                        );
                                        toast.success('Phone copied.');
                                      } catch {
                                        toast.error('Failed to copy.');
                                      }
                                    }}
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy phone</TooltipContent>
                              </Tooltip>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  {!isCompactView && (
                    <TableCell className="text-muted-foreground whitespace-nowrap text-sm align-top">
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
                  )}
                  {!isCompactView && (
                    <TableCell className="align-top">
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
                          <TooltipContent>Event messages</TooltipContent>
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
                  )}
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

      <DeleteEventDialog
        pendingDeleteEvent={pendingDeleteEvent}
        deletingId={deletingId}
        onCloseAction={() => setPendingDeleteEvent(null)}
        onConfirmAction={confirmDelete}
      />

      <EditEventDialog
        open={!!editingEvent}
        editBuilding={editBuilding}
        editWard={editWard}
        editName={editName}
        editEventDate={editEventDate}
        editStartTime={editStartTime}
        editEndTime={editEndTime}
        editPhone={editPhone}
        editEmail={editEmail}
        editDescription={editDescription}
        isSavingEdit={isSavingEdit}
        canSave={!!editingEvent && !!onEdit}
        onCloseAction={() => setEditingEvent(null)}
        onSubmitAction={submitEdit}
        setEditBuildingAction={setEditBuilding}
        setEditWardAction={setEditWard}
        setEditNameAction={setEditName}
        setEditEventDateAction={setEditEventDate}
        setEditStartTimeAction={setEditStartTime}
        setEditEndTimeAction={setEditEndTime}
        setEditPhoneAction={setEditPhone}
        setEditEmailAction={setEditEmail}
        setEditDescriptionAction={setEditDescription}
        formatPhoneAction={formatPhone}
      />

      <CloneEventDialog
        open={!!cloningEvent}
        cloneBuilding={cloneBuilding}
        cloneWard={cloneWard}
        cloneName={cloneName}
        cloneEventDate={cloneEventDate}
        cloneStartTime={cloneStartTime}
        cloneEndTime={cloneEndTime}
        clonePhone={clonePhone}
        cloneEmail={cloneEmail}
        cloneDescription={cloneDescription}
        isSavingClone={isSavingClone}
        canSave={!!cloningEvent && !!onClone}
        onCloseAction={() => setCloningEvent(null)}
        onSubmitAction={submitClone}
        setCloneBuildingAction={setCloneBuilding}
        setCloneWardAction={setCloneWard}
        setCloneNameAction={setCloneName}
        setCloneEventDateAction={setCloneEventDate}
        setCloneStartTimeAction={setCloneStartTime}
        setCloneEndTimeAction={setCloneEndTime}
        setClonePhoneAction={setClonePhone}
        setCloneEmailAction={setCloneEmail}
        setCloneDescriptionAction={setCloneDescription}
        formatPhoneAction={formatPhone}
      />

      <EventMessagesDialog
        copyingEvent={copyingEvent}
        messageTemplates={messageTemplates}
        onCloseAction={() => setCopyingEvent(null)}
        formatPhoneAction={formatPhone}
        renderMessageTemplateAction={renderMessageTemplate}
      />

      <KindooLicenseDialog
        licenseEvent={licenseEvent}
        messageTemplates={messageTemplates}
        onCloseAction={() => setLicenseEvent(null)}
        onToggleLicenseCreatedAction={onSetKindooLicenseCreated}
        submitKindooLicenseStatusAction={submitKindooLicenseStatus}
        getLicenseTimesAction={getLicenseTimes}
        formatDateAction={formatDate}
        formatTimeRangeAction={formatTimeRange}
        renderMessageTemplateAction={renderMessageTemplate}
      />
    </TooltipProvider>
  );
}
