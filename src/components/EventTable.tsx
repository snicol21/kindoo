'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  ExternalLink,
  CheckCircle2,
  MoreVertical,
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
  onSetKindooLicenseCreated?: (input: {
    eventId: string;
    kindooLicenseCreated: boolean;
  }) => Promise<void>;
  licenseLeadDays?: number;
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

function parseTimeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatLicenseDate(ymd: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
}

function formatLicenseTime(minutes: number) {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, '0')} ${period}`;
}

function getLicenseTimes(event: EventWithCreator) {
  const startMinutes = parseTimeToMinutes(event.startTime);
  const endMinutes = parseTimeToMinutes(event.endTime);
  if (startMinutes === null || endMinutes === null) return null;
  const earliestMinutes = 5 * 60;
  const latestMinutes = 23 * 60;
  const start = Math.max(earliestMinutes, startMinutes - 120);
  const end = Math.min(latestMinutes, endMinutes + 120);
  return {
    startDate: formatLicenseDate(event.eventDate),
    startTime: formatLicenseTime(start),
    endDate: formatLicenseDate(event.eventDate),
    endTime: formatLicenseTime(end),
  };
}

function validateTimeWindow(startTime: string, endTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const earliestMinutes = 5 * 60;
  const latestMinutes = 23 * 60;
  if (startMinutes === null || endMinutes === null) {
    return 'Start and end times are required.';
  }
  if (startMinutes < earliestMinutes || startMinutes > latestMinutes) {
    return 'Start time must be between 5:00 AM and 11:00 PM.';
  }
  if (endMinutes > latestMinutes) {
    return 'End time must be no later than 11:00 PM.';
  }
  if (endMinutes <= startMinutes) {
    return 'End time must be after start time.';
  }
  return null;
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
    `${firstName}, I was able to confirm availability for your private event on ${date} from ${time} at the ${event.building}.`,
    '',
    'We will need your email address that you use on your church membership record so we can issue your temporary Kindoo access.',
    '',
    'Also we require you to please review the Stake Meetinghouse Use Policies here:',
    'https://drive.google.com/file/d/1LBukeaPHsg8eB-EtAyXXiPbq--o7wV1h/view?usp=sharing',
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

function buildKindooLicenseCreatedMessage(event: EventWithCreator) {
  const firstName = getFirstName(event.name);
  const licenseTimes = getLicenseTimes(event);
  const timeframe = licenseTimes
    ? `Your access window is ${licenseTimes.startDate} at ${licenseTimes.startTime} through ${licenseTimes.endDate} at ${licenseTimes.endTime}. `
    : '';
  return `Hi ${firstName}, we just created a temporary Kindoo license for you. ${timeframe}You should receive an invitation email shortly with a link to download the app. After installing, sign in with the same email/Church account, allow Bluetooth + Location, and near the entrance open the app and tap Open to unlock the door.`;
}

export function EventTable({
  events,
  isLoading,
  isError,
  building,
  onDelete,
  onEdit,
  onClone,
  onSetKindooLicenseCreated,
  licenseLeadDays,
  selectedIds,
  onSelectionChange,
}: EventTableProps) {
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
  const licenseDialogContentRef = useRef<HTMLDivElement | null>(null);
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
  const [isMobileView, setIsMobileView] = useState(false);

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
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobileView(event.matches);
    };

    setIsMobileView(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

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
      const timeError = validateTimeWindow(editStartTime, editEndTime);
      if (timeError) {
        toast.error(timeError);
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
      <div className={`rounded-md border ${isMobileView ? 'overflow-hidden' : 'overflow-x-auto'}`}>
        <Table
          className={`${
            isMobileView
              ? 'table-fixed [&_th]:px-1 [&_td]:px-1 [&_th]:py-1 [&_td]:py-1'
              : 'table-auto [&_th]:px-2 [&_td]:px-2 [&_th]:py-2 [&_td]:py-2'
          }`}
        >
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
              <TableHead className={isMobileView ? 'w-20' : 'w-[150px]'}>
                <SortButton col="daysUntil" label={isMobileView ? 'Days' : 'Days Until'} />
              </TableHead>
              <TableHead className={isMobileView ? 'min-w-0' : 'min-w-[260px]'}>
                <SortButton col="eventDate" label="Event" />
              </TableHead>
              {!isMobileView && (
                <>
                  <TableHead className="w-[240px]">
                    <SortButton col="name" label="Member" />
                  </TableHead>
                  <TableHead className="w-[240px]">Member Contact</TableHead>
                  <TableHead className="w-[140px]">Created</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedEvents.map((event) => {
              const isOptimistic = event.id.startsWith('optimistic-');
              return (
                <TableRow
                  key={event.id}
                  className={isOptimistic ? 'opacity-60 animate-pulse' : undefined}
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
                  <TableCell
                    className={
                      isMobileView ? 'w-20 text-foreground text-sm' : 'text-foreground text-sm'
                    }
                  >
                    {isOptimistic
                      ? '—'
                      : (() => {
                          const daysValue = getDaysUntilValue(event.eventDate);
                          const withinWindow =
                            Number.isFinite(daysValue) &&
                            daysValue >= 0 &&
                            daysValue <= effectiveLeadDays;
                          const isCompleted = !!event.kindooLicenseCreated;
                          return (
                            <div className="flex flex-col gap-2">
                              <div
                                className={
                                  withinWindow && !isCompleted
                                    ? 'font-semibold text-yellow-600 animate-pulse'
                                    : isCompleted
                                      ? 'font-semibold text-emerald-700'
                                      : 'text-foreground'
                                }
                              >
                                {getDaysUntil(event.eventDate)}
                              </div>
                              {isCompleted ? (
                                <button
                                  type="button"
                                  className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 disabled:cursor-not-allowed"
                                  onClick={() => setLicenseEvent(event)}
                                  disabled={!onSetKindooLicenseCreated || isSavingLicenseStatus}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span className="underline underline-offset-2">
                                    License created
                                  </span>
                                </button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={`${isMobileView ? 'px-2 text-xs' : 'px-3 text-sm'} ${
                                    withinWindow
                                      ? 'border-yellow-500 bg-yellow-500 text-black hover:bg-yellow-600 hover:border-yellow-600'
                                      : ''
                                  }`}
                                  disabled={!withinWindow}
                                  onClick={() => setLicenseEvent(event)}
                                >
                                  {isMobileView ? 'Kindoo' : 'Kindoo License'}
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                  </TableCell>
                  <TableCell className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-foreground text-xs font-semibold">
                          {formatDate(event.eventDate)}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatTimeRange(event.startTime, event.endTime)}
                        </div>
                      </div>
                      {isMobileView && (
                        <div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
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
                                Message templates
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
                    <p
                      className="text-muted-foreground text-xs line-clamp-2"
                      title={event.description}
                    >
                      {event.description}
                    </p>
                    {isMobileView && (
                      <div className="mt-2 space-y-1.5">
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
                            <a
                              href={`mailto:${event.email}`}
                              className="max-w-44 truncate font-semibold text-foreground hover:underline"
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
                              className="max-w-44 truncate hover:text-foreground hover:underline"
                              title={formatPhone(event.phone)}
                            >
                              {formatPhone(event.phone)}
                            </a>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Created by {event.creatorName || event.creatorEmail || '—'} ·{' '}
                          {new Date(event.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  {!isMobileView && (
                    <TableCell className="max-w-[360px]">
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
                  {!isMobileView && (
                    <TableCell className="max-w-[280px]">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {event.email ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`mailto:${event.email}`}
                                className="truncate cursor-pointer font-semibold text-foreground hover:underline"
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
                  {!isMobileView && (
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
                  )}
                  {!isMobileView && (
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
                  min="05:00"
                  max="23:00"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-end-time">End</Label>
                <Input
                  id="edit-end-time"
                  type="time"
                  min="05:00"
                  max="23:00"
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
                  min="05:00"
                  max="23:00"
                  value={cloneStartTime}
                  onChange={(e) => setCloneStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="clone-end-time">End</Label>
                <Input
                  id="clone-end-time"
                  type="time"
                  min="05:00"
                  max="23:00"
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
        <DialogContent className="sm:max-w-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
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
                      <div className="flex w-full items-center gap-2">
                        <Input readOnly value={copyingEvent.email} className="min-w-0 flex-1" />
                        <Button
                          variant="secondary"
                          size="icon"
                          className="shrink-0 sm:mr-3"
                          aria-label="Copy email"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(copyingEvent.email ?? '');
                              toast.success('Email copied.');
                            } catch {
                              toast.error('Failed to copy.');
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {copyingEvent.phone?.trim() && (
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <div className="flex w-full items-center gap-2">
                        <Input
                          readOnly
                          value={formatPhone(copyingEvent.phone)}
                          className="min-w-0 flex-1"
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          className="shrink-0 sm:mr-3"
                          aria-label="Copy phone"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(formatPhone(copyingEvent.phone));
                              toast.success('Phone copied.');
                            } catch {
                              toast.error('Failed to copy.');
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" />
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
                    className="min-w-0 flex-1 min-h-[140px]"
                    value={buildShortMessage(copyingEvent)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
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
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Message
                  </Button>
                </div>
                <div className="flex h-full flex-col gap-2">
                  <Label>Calendar item description</Label>
                  <Textarea
                    readOnly
                    rows={6}
                    className="min-w-0 flex-1 min-h-[140px]"
                    value={buildCalendarItemDescription(copyingEvent)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
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
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Message
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Availability confirmed + policy text</Label>
                <Textarea
                  readOnly
                  rows={9}
                  className="min-w-0"
                  value={buildFullMessage(copyingEvent)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(buildFullMessage(copyingEvent));
                      toast.success('Availability confirmed + policy text copied.');
                    } catch {
                      toast.error('Failed to copy.');
                    }
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
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

      <Dialog open={!!licenseEvent} onOpenChange={(open) => !open && setLicenseEvent(null)}>
        <DialogContent
          ref={licenseDialogContentRef}
          tabIndex={-1}
          className="sm:max-w-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              licenseDialogContentRef.current?.focus();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Kindoo License</DialogTitle>
            <DialogDescription>Copy these values into the Kindoo setup form.</DialogDescription>
          </DialogHeader>
          {licenseEvent && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium text-foreground">License timing reference</p>
                <p className="text-muted-foreground">
                  Event: {formatDate(licenseEvent.eventDate)} ·{' '}
                  {formatTimeRange(licenseEvent.startTime, licenseEvent.endTime)}
                </p>
                <p className="text-muted-foreground">
                  Generated values use 2 hours before event start and 2 hours after event end,
                  capped to the allowed 5:00 AM–11:00 PM window.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Email of the new user</Label>
                <div className="flex w-full items-center gap-2">
                  <Input
                    readOnly
                    value={licenseEvent.email || ''}
                    placeholder="No email"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="shrink-0 sm:mr-3"
                    aria-label="Copy email"
                    disabled={!licenseEvent.email}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(licenseEvent.email ?? '');
                        toast.success('Email copied.');
                      } catch {
                        toast.error('Failed to copy.');
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(() => {
                const licenseTimes = getLicenseTimes(licenseEvent);
                if (!licenseTimes) return null;
                return (
                  <>
                    <div className="space-y-2">
                      <Label>Rights activated starting</Label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={licenseTimes.startDate}
                            className="min-w-0 flex-1"
                          />
                          <Button
                            variant="secondary"
                            size="icon"
                            className="shrink-0 sm:mr-3"
                            aria-label="Copy start date"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(licenseTimes.startDate);
                                toast.success('Start date copied.');
                              } catch {
                                toast.error('Failed to copy.');
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={licenseTimes.startTime}
                            className="min-w-0 flex-1"
                          />
                          <Button
                            variant="secondary"
                            size="icon"
                            className="shrink-0 sm:mr-3"
                            aria-label="Copy start time"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(licenseTimes.startTime);
                                toast.success('Start time copied.');
                              } catch {
                                toast.error('Failed to copy.');
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>User expiry date and time</Label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Input readOnly value={licenseTimes.endDate} className="min-w-0 flex-1" />
                          <Button
                            variant="secondary"
                            size="icon"
                            className="shrink-0 sm:mr-3"
                            aria-label="Copy expiry date"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(licenseTimes.endDate);
                                toast.success('Expiry date copied.');
                              } catch {
                                toast.error('Failed to copy.');
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input readOnly value={licenseTimes.endTime} className="min-w-0 flex-1" />
                          <Button
                            variant="secondary"
                            size="icon"
                            className="shrink-0 sm:mr-3"
                            aria-label="Copy expiry time"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(licenseTimes.endTime);
                                toast.success('Expiry time copied.');
                              } catch {
                                toast.error('Failed to copy.');
                              }
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
              <div className="space-y-2">
                <Label>User description</Label>
                <div className="flex w-full items-center gap-2">
                  <Input
                    readOnly
                    className="min-w-0 flex-1"
                    value={`[${licenseEvent.ward ?? ''}] - [Private Event] - [${licenseEvent.name}]`}
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="shrink-0 sm:mr-3"
                    aria-label="Copy user description"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `[${licenseEvent.ward ?? ''}] - [Private Event] - [${licenseEvent.name}]`
                        );
                        toast.success('User description copied.');
                      } catch {
                        toast.error('Failed to copy.');
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <a
                  href="https://web.kindoo.tech/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-foreground underline underline-offset-4 hover:text-primary"
                >
                  Open Kindoo
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="rounded-md border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-600"
                    checked={!!licenseEvent.kindooLicenseCreated}
                    disabled={!onSetKindooLicenseCreated}
                    onChange={(e) => {
                      void submitKindooLicenseStatus(licenseEvent, e.target.checked);
                    }}
                  />
                  Temporary license created
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mark this when setup is complete so the table shows the event as finished.
                </p>
                <div className="mt-3 border-t border-border pt-3 space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Temporary license created text
                  </Label>
                  <Textarea
                    readOnly
                    rows={3}
                    value={buildKindooLicenseCreatedMessage(licenseEvent)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          buildKindooLicenseCreatedMessage(licenseEvent)
                        );
                        toast.success('Temporary license message copied.');
                      } catch {
                        toast.error('Failed to copy.');
                      }
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Message
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLicenseEvent(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
