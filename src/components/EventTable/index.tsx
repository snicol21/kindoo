'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/_ui/table';
import { Button } from '@/components/_ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/_ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/_ui/dropdown-menu';
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
import { useContactSearch } from '@/hooks/useContacts';
import { updateContact, type ContactSearchResult } from '@/actions/contacts';
import { useContactChangeState } from '@/hooks/useContactChangeState';
import { findExactContact, getContactSuggestions } from '@/lib/contact-matching';

type WorkerHealthSummary = {
  status: 'healthy' | 'stale' | 'down' | 'unknown';
  workerId?: string;
  lastSeenAt?: string;
};

const HIDE_SCHEDULE_COUNTDOWN_OUTCOMES = new Set([
  'Request queued',
  'Request in progress',
  'Retry queued',
  'Retry in progress',
  'Request failed',
  'Retry failed',
  'Temporary license created',
  'Active license already existed',
  'License created',
]);

const PERSIST_PENDING_OUTCOMES = new Set([
  'Request queued',
  'Request in progress',
  'Retry queued',
  'Retry in progress',
]);

function getLicenseOutcomeVisual(outcome: string) {
  if (outcome === 'Retry in progress') {
    return {
      textClassName: 'text-amber-700 hover:text-amber-800',
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    };
  }

  if (outcome === 'Retry queued') {
    return {
      textClassName: 'text-amber-700 hover:text-amber-800',
      icon: <Clock className="h-3.5 w-3.5" />,
    };
  }

  if (outcome === 'Retry failed') {
    return {
      textClassName: 'text-red-700 hover:text-red-800',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    };
  }

  if (outcome === 'Request in progress') {
    return {
      textClassName: 'text-amber-700 hover:text-amber-800',
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    };
  }

  if (outcome === 'Request queued') {
    return {
      textClassName: 'text-amber-700 hover:text-amber-800',
      icon: <Clock className="h-3.5 w-3.5" />,
    };
  }

  if (outcome === 'Request failed') {
    return {
      textClassName: 'text-red-700 hover:text-red-800',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    };
  }

  if (outcome === 'Scheduled for license') {
    return {
      textClassName: 'text-slate-700 hover:text-slate-800',
      icon: <Clock className="h-3.5 w-3.5" />,
    };
  }

  if (outcome === 'Auto-schedule pending') {
    return {
      textClassName: 'text-slate-600 hover:text-slate-700',
      icon: <Clock className="h-3.5 w-3.5" />,
    };
  }

  return {
    textClassName: 'text-emerald-700 hover:text-emerald-800',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  };
}

function parseTimeToMinutes(time: string) {
  const parts = time.split(':');
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getAutoScheduleDueTimestamp(eventDate: string, startTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return Number.NaN;
  const licenseWindowStart = Math.max(5 * 60, startMinutes - 120);
  const dueMinutes = Math.max(0, licenseWindowStart - 120);
  const dueHours = Math.floor(dueMinutes / 60);
  const dueRemainderMinutes = dueMinutes % 60;
  return toLocalDateTime(
    eventDate,
    `${String(dueHours).padStart(2, '0')}:${String(dueRemainderMinutes).padStart(2, '0')}`
  );
}

function formatCountdownMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function isAutoScheduleDueNow(eventDate: string, startTime: string, endTime: string) {
  const dueAt = getAutoScheduleDueTimestamp(eventDate, startTime);
  const endAt = toLocalDateTime(eventDate, endTime);
  if (!Number.isFinite(dueAt) || !Number.isFinite(endAt)) return false;
  const now = Date.now();
  return now >= dueAt && now <= endAt;
}

export function EventTable({
  events,
  isLoading,
  isError,
  building,
  emptyStateTitle,
  emptyStateMessage,
  messageTemplates,
  onDelete,
  onEdit,
  onClone,
  onSetKindooLicenseCreated,
  selectedIds,
  onSelectionChange,
}: EventTableProps) {
  // Adjust this value to control when the table collapses from Event+Contact to Event-only.
  const SINGLE_COLUMN_MAX_WIDTH = 639;
  const PAGE_SIZE = 10;

  const [sortKey, setSortKey] = useState<SortKey>('eventDate');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<EventWithCreator | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventWithCreator | null>(null);
  const [licenseEvent, setLicenseEvent] = useState<EventWithCreator | null>(null);
  const [licenseOutcomePreview, setLicenseOutcomePreview] = useState<string | null>(null);
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
  const [editMatchedContactId, setEditMatchedContactId] = useState<string | null>(null);
  const [editMatchedContact, setEditMatchedContact] = useState<ContactSearchResult | null>(null);
  const [editMatchCandidate, setEditMatchCandidate] = useState<
    (typeof editMatchingContacts)[number] | null
  >(null);
  const [editDismissedMatchId, setEditDismissedMatchId] = useState<string | null>(null);
  const [editContactFocusField, setEditContactFocusField] = useState<
    'name' | 'phone' | 'email' | null
  >(null);
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
  const [cloneMatchedContactId, setCloneMatchedContactId] = useState<string | null>(null);
  const [cloneMatchedContact, setCloneMatchedContact] = useState<ContactSearchResult | null>(null);
  const [cloneMatchCandidate, setCloneMatchCandidate] = useState<
    (typeof cloneMatchingContacts)[number] | null
  >(null);
  const [cloneDismissedMatchId, setCloneDismissedMatchId] = useState<string | null>(null);
  const [cloneContactFocusField, setCloneContactFocusField] = useState<
    'name' | 'phone' | 'email' | null
  >(null);
  const [isSavingClone, setIsSavingClone] = useState(false);
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const [isCompactView, setIsCompactView] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [isSingleColumnView, setIsSingleColumnView] = useState(false);
  const [licenseOutcomeByEvent, setLicenseOutcomeByEvent] = useState<Record<string, string>>({});
  const [licenseOutcomeLoadedByEvent, setLicenseOutcomeLoadedByEvent] = useState<
    Record<string, boolean>
  >({});
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthSummary | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const editLookupQuery = editEmail.trim() || editPhone.trim() || editName.trim();
  const cloneLookupQuery = cloneEmail.trim() || clonePhone.trim() || cloneName.trim();

  useEffect(() => {
    const interval = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(interval);
  }, []);

  useEffect(() => {
    const trackedEvents = events
      .filter((event) => !event.id.startsWith('optimistic-'))
      .map((event) => {
        const isDueNow = isAutoScheduleDueNow(event.eventDate, event.startTime, event.endTime);
        const hasContactEmail = !!event.contactEmail?.trim();
        const shouldShowAutoSchedule = !event.kindooLicenseCreated && hasContactEmail && !isDueNow;

        return {
          id: event.id,
          isCompleted: !!event.kindooLicenseCreated,
          shouldShowScheduled: !event.kindooLicenseCreated && hasContactEmail && isDueNow,
          shouldShowAutoSchedule,
        };
      });
    if (trackedEvents.length === 0) {
      setLicenseOutcomeByEvent({});
      setLicenseOutcomeLoadedByEvent({});
      return;
    }

    const trackedEventIdSet = new Set(trackedEvents.map((event) => event.id));

    let cancelled = false;

    const loadOutcomes = async () => {
      const results = await Promise.all(
        trackedEvents.map(
          async ({ id: eventId, isCompleted, shouldShowScheduled, shouldShowAutoSchedule }) => {
            try {
              const response = await fetch(`/api/license-jobs/event/${eventId}/latest`, {
                cache: 'no-store',
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) {
                return [
                  eventId,
                  isCompleted
                    ? 'License created'
                    : shouldShowScheduled
                      ? 'Scheduled for license'
                      : shouldShowAutoSchedule
                        ? 'Auto-schedule pending'
                        : null,
                ] as const;
              }

              const jobStatus = data?.job?.status;
              if (jobStatus === 'queued') {
                return [eventId, isCompleted ? 'Retry queued' : 'Request queued'] as const;
              }
              if (jobStatus === 'processing') {
                return [
                  eventId,
                  isCompleted ? 'Retry in progress' : 'Request in progress',
                ] as const;
              }
              if (jobStatus === 'failed') {
                return [eventId, isCompleted ? 'Retry failed' : 'Request failed'] as const;
              }

              const completionType = data?.job?.completionType;
              if (completionType === 'existing-active-license') {
                return [eventId, 'Active license already existed'] as const;
              }
              if (completionType === 'temporary-license-created') {
                return [eventId, 'Temporary license created'] as const;
              }
              return [
                eventId,
                isCompleted
                  ? 'License created'
                  : shouldShowScheduled
                    ? 'Scheduled for license'
                    : shouldShowAutoSchedule
                      ? 'Auto-schedule pending'
                      : null,
              ] as const;
            } catch {
              return [
                eventId,
                isCompleted
                  ? 'License created'
                  : shouldShowScheduled
                    ? 'Scheduled for license'
                    : shouldShowAutoSchedule
                      ? 'Auto-schedule pending'
                      : null,
              ] as const;
            }
          }
        )
      );

      if (cancelled) return;
      setLicenseOutcomeByEvent((prev) => {
        const nextOutcomes: Record<string, string> = {};
        for (const [eventId, outcome] of results) {
          if (typeof outcome === 'string' && outcome.length > 0) {
            nextOutcomes[eventId] = outcome;
            continue;
          }
          const previousOutcome = prev[eventId];
          if (previousOutcome && PERSIST_PENDING_OUTCOMES.has(previousOutcome)) {
            nextOutcomes[eventId] = previousOutcome;
          }
        }
        return nextOutcomes;
      });
      const nextLoaded: Record<string, boolean> = {};
      for (const trackedEvent of trackedEvents) {
        nextLoaded[trackedEvent.id] = true;
      }
      setLicenseOutcomeLoadedByEvent(nextLoaded);
    };

    void loadOutcomes();

    let reloadTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimeout) return;
      reloadTimeout = globalThis.setTimeout(() => {
        reloadTimeout = null;
        void loadOutcomes();
      }, 150);
    };

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof globalThis.setTimeout> | null = null;
    let reconnectDelayMs = 1000;

    const clearReconnect = () => {
      if (reconnectTimeout) {
        globalThis.clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    };

    const scheduleReconnect = () => {
      if (document.visibilityState !== 'visible') return;
      if (reconnectTimeout) return;
      reconnectTimeout = globalThis.setTimeout(() => {
        reconnectTimeout = null;
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
        connectStream();
      }, reconnectDelayMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        reconnectDelayMs = 1000;
        clearReconnect();
        connectStream();
      }
    };

    const connectStream = () => {
      if (typeof EventSource === 'undefined') return;
      eventSource?.close();
      eventSource = new EventSource('/api/license-jobs/stream');
      eventSource.addEventListener('license-job-updated', (rawEvent) => {
        try {
          const parsed = JSON.parse((rawEvent as MessageEvent).data ?? '{}') as {
            eventId?: string;
          };
          if (!parsed.eventId) return;
          if (!trackedEventIdSet.has(parsed.eventId)) return;
          scheduleReload();
        } catch {
          // Ignore parse errors and keep polling fallback.
        }
      });
      eventSource.addEventListener('error', () => {
        eventSource?.close();
        scheduleReconnect();
      });
    };

    connectStream();
    document.addEventListener('visibilitychange', handleVisibility);

    const intervalId = globalThis.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadOutcomes();
      }
    }, 10000);

    return () => {
      cancelled = true;
      if (reloadTimeout) {
        globalThis.clearTimeout(reloadTimeout);
      }
      globalThis.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearReconnect();
      eventSource?.close();
    };
  }, [events]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkerHealth = async () => {
      try {
        const response = await fetch('/api/license-jobs/worker-health', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        const health = data?.health as WorkerHealthSummary | undefined;
        if (!health) return;
        setWorkerHealth(health);
      } catch {
        // Ignore worker health fetch errors in table view.
      }
    };

    void loadWorkerHealth();
    const intervalId = globalThis.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadWorkerHealth();
      }
    }, 15000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(intervalId);
    };
  }, []);

  const { data: editMatchingContacts = [], isFetching: isFetchingEditMatches } = useContactSearch(
    editLookupQuery,
    {
      ward: editWard || undefined,
    }
  );
  const { data: cloneMatchingContacts = [], isFetching: isFetchingCloneMatches } = useContactSearch(
    cloneLookupQuery,
    {
      ward: cloneWard || undefined,
    }
  );

  const editNameMatches = useMemo(
    () =>
      getContactSuggestions(editMatchingContacts, {
        name: editName,
        ward: editWard,
        email: editEmail,
        phone: editPhone,
      }),
    [editEmail, editMatchingContacts, editName, editPhone, editWard]
  );
  const cloneNameMatches = useMemo(
    () =>
      getContactSuggestions(cloneMatchingContacts, {
        name: cloneName,
        ward: cloneWard,
        email: cloneEmail,
        phone: clonePhone,
      }),
    [cloneEmail, cloneMatchingContacts, cloneName, clonePhone, cloneWard]
  );

  const editNameMatchCandidates = useMemo(
    () =>
      editNameMatches.filter(
        (contact) => contact.id !== editMatchedContactId && contact.id !== editDismissedMatchId
      ),
    [editDismissedMatchId, editMatchedContactId, editNameMatches]
  );
  const cloneNameMatchCandidates = useMemo(
    () =>
      cloneNameMatches.filter(
        (contact) => contact.id !== cloneMatchedContactId && contact.id !== cloneDismissedMatchId
      ),
    [cloneDismissedMatchId, cloneMatchedContactId, cloneNameMatches]
  );

  const editNameMatchCandidate = editNameMatchCandidates[0] ?? null;
  const cloneNameMatchCandidate = cloneNameMatchCandidates[0] ?? null;

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
      valA = a.contactName.toLowerCase();
      valB = b.contactName.toLowerCase();
    } else if (sortKey === 'email') {
      valA = (a.contactEmail ?? '').toLowerCase();
      valB = (b.contactEmail ?? '').toLowerCase();
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
    const initialMatchedContact: ContactSearchResult | null = event.contactWard
      ? {
          id: event.contactId,
          name: event.contactName,
          ward: event.contactWard,
          email: event.contactEmail ?? null,
          phone: event.contactPhone ?? null,
        }
      : null;
    setEditingEvent(event);
    setEditMatchedContactId(initialMatchedContact?.id ?? null);
    setEditMatchedContact(initialMatchedContact);
    setEditMatchCandidate(null);
    setEditDismissedMatchId(null);
    setEditContactFocusField(null);
    setEditBuilding(event.building);
    setEditName(event.contactName);
    setEditWard(event.contactWard ?? '');
    setEditEventDate(event.eventDate);
    setEditStartTime(event.startTime);
    setEditEndTime(event.endTime);
    setEditPhone(formatPhone(event.contactPhone ?? ''));
    setEditEmail(event.contactEmail ?? '');
    setEditDescription(event.description);
  };

  const applyEditMatch = (contact: (typeof editMatchingContacts)[number]) => {
    setEditMatchedContactId(contact.id);
    setEditMatchedContact(contact);
    setEditName(contact.name);
    setEditWard(contact.ward);
    setEditEmail(contact.email ?? '');
    setEditPhone(formatPhone(contact.phone ?? ''));
  };

  useEffect(() => {
    if (!editingEvent) return;
    const match = findExactContact(editMatchingContacts, {
      name: editName,
      ward: editWard,
      email: editEmail,
      phone: editPhone,
    });
    if (!match) {
      setEditMatchCandidate(null);
      setEditDismissedMatchId(null);
      return;
    }
    if (match.id === editMatchedContactId || editDismissedMatchId === match.id) {
      setEditMatchCandidate(null);
      return;
    }
    setEditMatchCandidate(match);
  }, [
    editDismissedMatchId,
    editEmail,
    editMatchingContacts,
    editMatchedContactId,
    editName,
    editPhone,
    editWard,
    editingEvent,
  ]);

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

      if (editChangeState.hasEdits && !editChangeState.willCreateNewContact) {
        const contactResult = await updateContact({
          id: editingEvent.contactId,
          name: editName.trim(),
          ward: editWard as Ward,
          email: editEmail.trim() || null,
          phone: editPhone || null,
        });

        if (!contactResult.success) {
          toast.error(contactResult.error ?? 'Failed to update linked contact.');
          return;
        }
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
    const initialMatchedContact: ContactSearchResult | null = event.contactWard
      ? {
          id: event.contactId,
          name: event.contactName,
          ward: event.contactWard,
          email: event.contactEmail ?? null,
          phone: event.contactPhone ?? null,
        }
      : null;
    setCloningEvent(event);
    setCloneMatchedContactId(initialMatchedContact?.id ?? null);
    setCloneMatchedContact(initialMatchedContact);
    setCloneMatchCandidate(null);
    setCloneDismissedMatchId(null);
    setCloneContactFocusField(null);
    setCloneBuilding(event.building);
    setCloneName(event.contactName);
    setCloneWard(event.contactWard ?? '');
    setCloneEventDate(event.eventDate);
    setCloneStartTime(event.startTime);
    setCloneEndTime(event.endTime);
    setClonePhone(formatPhone(event.contactPhone ?? ''));
    setCloneEmail(event.contactEmail ?? '');
    setCloneDescription(event.description);
  };

  const applyCloneMatch = (contact: (typeof cloneMatchingContacts)[number]) => {
    setCloneMatchedContactId(contact.id);
    setCloneMatchedContact(contact);
    setCloneName(contact.name);
    setCloneWard(contact.ward);
    setCloneEmail(contact.email ?? '');
    setClonePhone(formatPhone(contact.phone ?? ''));
  };

  const editChangeState = useContactChangeState(editMatchedContact, {
    name: editName,
    ward: editWard,
    email: editEmail,
    phone: editPhone,
  });

  const cloneChangeState = useContactChangeState(cloneMatchedContact, {
    name: cloneName,
    ward: cloneWard,
    email: cloneEmail,
    phone: clonePhone,
  });

  useEffect(() => {
    if (!cloningEvent) return;
    const match = findExactContact(cloneMatchingContacts, {
      name: cloneName,
      ward: cloneWard,
      email: cloneEmail,
      phone: clonePhone,
    });
    if (!match) {
      setCloneMatchCandidate(null);
      setCloneDismissedMatchId(null);
      return;
    }
    if (match.id === cloneMatchedContactId || cloneDismissedMatchId === match.id) {
      setCloneMatchCandidate(null);
      return;
    }
    setCloneMatchCandidate(match);
  }, [
    cloneDismissedMatchId,
    cloneEmail,
    cloneMatchingContacts,
    cloneMatchedContactId,
    cloneName,
    clonePhone,
    cloneWard,
    cloningEvent,
  ]);

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
      if (
        cloneMatchedContactId &&
        cloneMatchedContact &&
        cloneChangeState.hasEdits &&
        !cloneChangeState.willCreateNewContact
      ) {
        const contactResult = await updateContact({
          id: cloneMatchedContactId,
          name: cloneName.trim(),
          ward: cloneWard as Ward,
          email: cloneEmail.trim() || null,
          phone: clonePhone || null,
        });

        if (!contactResult.success) {
          toast.error(contactResult.error ?? 'Failed to update linked contact.');
          return;
        }
      }

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
    const title = emptyStateTitle ?? 'No events yet';
    const message =
      emptyStateMessage ?? `Add your first event for ${building} using the button above.`;
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Inbox className="h-10 w-10 opacity-40" />
        <p className="font-medium">{title}</p>
        <p className="text-sm text-center max-w-sm">{message}</p>
      </div>
    );
  }

  const hasPendingLicenseJobs = Object.values(licenseOutcomeByEvent).some(
    (outcome) =>
      outcome === 'Request queued' ||
      outcome === 'Request in progress' ||
      outcome === 'Retry queued' ||
      outcome === 'Retry in progress'
  );
  const showWorkerHealthWarning =
    hasPendingLicenseJobs &&
    workerHealth &&
    (workerHealth.status === 'stale' ||
      workerHealth.status === 'down' ||
      workerHealth.status === 'unknown');
  const workerLastSeenLabel = workerHealth?.lastSeenAt
    ? new Date(workerHealth.lastSeenAt).toLocaleTimeString('en-US')
    : null;

  return (
    <TooltipProvider delayDuration={200}>
      {showWorkerHealthWarning && (
        <div className="mb-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">Worker may be offline.</p>
          <p className="mt-1">
            {workerHealth.status === 'unknown'
              ? 'No worker heartbeat has been received yet.'
              : workerHealth.status === 'stale'
                ? 'Worker heartbeat is stale and queued jobs may be delayed.'
                : 'Worker appears down, so queued jobs might not process automatically.'}
          </p>
          <p className="mt-1 opacity-90">
            {workerHealth.workerId ? `Worker: ${workerHealth.workerId}. ` : ''}
            {workerLastSeenLabel ? `Last seen: ${workerLastSeenLabel}. ` : ''}
            Resume or restart the worker to continue automatic processing.
          </p>
        </div>
      )}
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
                  <SortButton col="name" label="Contact" />
                </TableHead>
              )}
              {!isCompactView && (
                <>
                  <TableHead className="w-60">Contact Info</TableHead>
                  <TableHead className="w-35">Created</TableHead>
                  <TableHead className="w-30">Actions</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedEvents.map((event) => {
              const isOptimistic = event.id.startsWith('optimistic-');
              const licenseOutcome = licenseOutcomeByEvent[event.id] ?? null;
              const hasLicenseStatus = !!licenseOutcome;
              const isLicenseOutcomeLoading =
                !isOptimistic && !licenseOutcomeLoadedByEvent[event.id];
              const shouldShowLicensePlaceholder =
                !isOptimistic && (hasLicenseStatus || isLicenseOutcomeLoading);
              const isDayOfEvent = getDaysUntilValue(event.eventDate) === 0;
              const dueAtMs = getAutoScheduleDueTimestamp(event.eventDate, event.startTime);
              const hasValidDueAt = Number.isFinite(dueAtMs);
              const msUntilDue = hasValidDueAt ? dueAtMs - nowMs : null;
              const hasEmail = !!event.contactEmail?.trim();
              const shouldShowScheduleCountdown =
                !isOptimistic &&
                !event.kindooLicenseCreated &&
                hasEmail &&
                isDayOfEvent &&
                hasValidDueAt &&
                (!licenseOutcome || !HIDE_SCHEDULE_COUNTDOWN_OUTCOMES.has(licenseOutcome));
              const shouldUseCountdownAsOutcomeLabel =
                shouldShowScheduleCountdown &&
                !!licenseOutcome &&
                (licenseOutcome === 'Auto-schedule pending' ||
                  licenseOutcome === 'Scheduled for license');
              const licenseOutcomeLabel = shouldUseCountdownAsOutcomeLabel
                ? msUntilDue !== null && msUntilDue > 0
                  ? `License schedules in ${formatCountdownMs(msUntilDue)}`
                  : 'License schedule time reached'
                : licenseOutcome;
              return (
                <TableRow
                  key={event.id}
                  className={isOptimistic ? 'opacity-60 animate-pulse' : undefined}
                >
                  <TableCell className="w-9">
                    <input
                      type="checkbox"
                      aria-label={`Select ${event.contactName}`}
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
                        {!isSingleColumnView && shouldShowLicensePlaceholder && (
                          <div className="mt-1.5 min-h-[18px]">
                            {hasLicenseStatus ? (
                              <button
                                type="button"
                                className={`inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium disabled:cursor-not-allowed ${getLicenseOutcomeVisual(licenseOutcome).textClassName}`}
                                onClick={() => {
                                  setLicenseEvent(event);
                                  setLicenseOutcomePreview(licenseOutcome);
                                }}
                                disabled={!onSetKindooLicenseCreated || isSavingLicenseStatus}
                              >
                                {getLicenseOutcomeVisual(licenseOutcome).icon}
                                <span className="underline underline-offset-2">
                                  {licenseOutcomeLabel}
                                </span>
                              </button>
                            ) : (
                              <div
                                className="h-4 w-36 rounded-full bg-muted/60 animate-pulse"
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        )}
                        {shouldShowScheduleCountdown && !shouldUseCountdownAsOutcomeLabel && (
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {msUntilDue !== null && msUntilDue > 0
                                ? `License schedules in ${formatCountdownMs(msUntilDue)}`
                                : 'License schedule time reached'}
                            </span>
                          </div>
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
                                aria-label={`Actions for ${event.contactName}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                disabled={isOptimistic || !onEdit}
                                onSelect={() => openEditDialog(event)}
                              >
                                <Pencil className="h-4 w-4" />
                                Edit event
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isOptimistic || !onClone}
                                onSelect={() => openCloneDialog(event)}
                              >
                                <CopyPlus className="h-4 w-4" />
                                Clone event
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={isOptimistic}
                                onSelect={() => setCopyingEvent(event)}
                              >
                                <MessageSquare className="h-4 w-4" />
                                Event messages
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
                            title={event.contactName}
                          >
                            {event.contactName}
                          </div>
                          <span className="text-muted-foreground text-xs">
                            ({event.contactWard ?? '—'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {event.contactEmail ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`mailto:${event.contactEmail}`}
                                className="max-w-44 truncate text-muted-foreground hover:underline"
                                title={event.contactEmail}
                              >
                                {event.contactEmail}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                aria-label={`Copy email for ${event.contactName}`}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(event.contactEmail ?? '');
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
                          {event.contactPhone ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`tel:${event.contactPhone.replace(/\D/g, '')}`}
                                className="max-w-44 truncate hover:text-foreground hover:underline"
                                title={formatPhone(event.contactPhone)}
                              >
                                {formatPhone(event.contactPhone)}
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 p-0"
                                aria-label={`Copy phone for ${event.contactName}`}
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(event.contactPhone ?? '');
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
                        {shouldShowLicensePlaceholder && (
                          <div className="min-h-[18px]">
                            {hasLicenseStatus ? (
                              <button
                                type="button"
                                className={`inline-flex w-fit cursor-pointer items-center gap-1.5 text-xs font-medium disabled:cursor-not-allowed ${getLicenseOutcomeVisual(licenseOutcome).textClassName}`}
                                onClick={() => {
                                  setLicenseEvent(event);
                                  setLicenseOutcomePreview(licenseOutcome);
                                }}
                                disabled={!onSetKindooLicenseCreated || isSavingLicenseStatus}
                              >
                                {getLicenseOutcomeVisual(licenseOutcome).icon}
                                <span className="underline underline-offset-2">
                                  {licenseOutcome}
                                </span>
                              </button>
                            ) : (
                              <div
                                className="h-4 w-36 rounded-full bg-muted/60 animate-pulse"
                                aria-hidden="true"
                              />
                            )}
                          </div>
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
                            title={event.contactName}
                          >
                            {event.contactName}
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Church className="h-3.5 w-3.5 shrink-0" />
                            <span>{event.contactWard ?? '—'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            {event.contactEmail ? (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <a
                                  href={`mailto:${event.contactEmail}`}
                                  className="max-w-44 truncate text-muted-foreground hover:underline"
                                  title={event.contactEmail}
                                >
                                  {event.contactEmail}
                                </a>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0"
                                  aria-label={`Copy email for ${event.contactName}`}
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(event.contactEmail ?? '');
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
                            {event.contactPhone ? (
                              <div className="flex min-w-0 items-center gap-1.5">
                                <a
                                  href={`tel:${event.contactPhone.replace(/\D/g, '')}`}
                                  className="max-w-44 truncate hover:text-foreground hover:underline"
                                  title={formatPhone(event.contactPhone)}
                                >
                                  {formatPhone(event.contactPhone)}
                                </a>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0"
                                  aria-label={`Copy phone for ${event.contactName}`}
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(event.contactPhone ?? '');
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
                              aria-label={`Actions for ${event.contactName}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              disabled={isOptimistic || !onEdit}
                              onSelect={() => openEditDialog(event)}
                            >
                              <Pencil className="h-4 w-4" />
                              Edit event
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isOptimistic || !onClone}
                              onSelect={() => openCloneDialog(event)}
                            >
                              <CopyPlus className="h-4 w-4" />
                              Clone event
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={isOptimistic}
                              onSelect={() => setCopyingEvent(event)}
                            >
                              <MessageSquare className="h-4 w-4" />
                              Event messages
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
                          title={event.contactName}
                        >
                          {event.contactName}
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Church className="h-3.5 w-3.5 shrink-0" />
                          <span>{event.contactWard ?? '—'}</span>
                        </div>
                      </div>
                    </TableCell>
                  )}
                  {!isCompactView && (
                    <TableCell className="max-w-70 align-top">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          {event.contactEmail ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`mailto:${event.contactEmail}`}
                                className="truncate cursor-pointer text-muted-foreground hover:underline"
                                title={event.contactEmail}
                              >
                                {event.contactEmail}
                              </a>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    aria-label={`Copy email for ${event.contactName}`}
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(
                                          event.contactEmail ?? ''
                                        );
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
                          {event.contactPhone ? (
                            <div className="flex min-w-0 items-center gap-1.5">
                              <a
                                href={`tel:${event.contactPhone.replace(/\D/g, '')}`}
                                className="truncate cursor-pointer hover:text-foreground hover:underline"
                                title={formatPhone(event.contactPhone)}
                              >
                                {formatPhone(event.contactPhone)}
                              </a>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    aria-label={`Copy phone for ${event.contactName}`}
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(
                                          formatPhone(event.contactPhone)
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
                              aria-label={`Edit ${event.contactName}`}
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
                              aria-label={`Clone ${event.contactName}`}
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
                              aria-label={`Copy ${event.contactName}`}
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
                              aria-label={`Delete ${event.contactName}`}
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
        onCloseAction={() => {
          setEditingEvent(null);
          setEditMatchedContactId(null);
          setEditMatchedContact(null);
          setEditMatchCandidate(null);
          setEditDismissedMatchId(null);
          setEditContactFocusField(null);
        }}
        onSubmitAction={submitEdit}
        setEditBuildingAction={setEditBuilding}
        setEditWardAction={setEditWard}
        setEditNameAction={(value) => {
          setEditName(value);
        }}
        setEditEventDateAction={setEditEventDate}
        setEditStartTimeAction={setEditStartTime}
        setEditEndTimeAction={setEditEndTime}
        setEditPhoneAction={(value) => {
          setEditPhone(value);
        }}
        setEditEmailAction={(value) => {
          setEditEmail(value);
        }}
        setEditDescriptionAction={setEditDescription}
        formatPhoneAction={formatPhone}
        matchCandidate={editMatchCandidate}
        nameMatchCandidates={editNameMatchCandidates}
        nameMatchCandidate={editNameMatchCandidate}
        nameMatchCount={editNameMatchCandidates.length}
        matchedContactId={editMatchedContactId}
        linkedContact={editMatchedContact}
        searchingContacts={editLookupQuery.trim().length >= 2 && isFetchingEditMatches}
        contactFocusField={editContactFocusField}
        onContactFocus={(field) => setEditContactFocusField(field)}
        onContactBlur={() => setEditContactFocusField(null)}
        onUseMatch={(contact) => {
          applyEditMatch(contact);
          setEditMatchCandidate(null);
          setEditDismissedMatchId(null);
        }}
        onClearLinkedContact={() => {
          if (editMatchedContactId) {
            setEditDismissedMatchId(editMatchedContactId);
          }
          setEditMatchedContactId(null);
          setEditMatchedContact(null);
          setEditMatchCandidate(null);
          setEditName('');
          setEditPhone('');
          setEditEmail('');
          setEditWard('');
        }}
        contactChangeState={editChangeState}
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
        onCloseAction={() => {
          setCloningEvent(null);
          setCloneMatchedContactId(null);
          setCloneMatchedContact(null);
          setCloneMatchCandidate(null);
          setCloneDismissedMatchId(null);
          setCloneContactFocusField(null);
        }}
        onSubmitAction={submitClone}
        setCloneBuildingAction={setCloneBuilding}
        setCloneWardAction={setCloneWard}
        setCloneNameAction={(value) => {
          setCloneName(value);
        }}
        setCloneEventDateAction={setCloneEventDate}
        setCloneStartTimeAction={setCloneStartTime}
        setCloneEndTimeAction={setCloneEndTime}
        setClonePhoneAction={(value) => {
          setClonePhone(value);
        }}
        setCloneEmailAction={(value) => {
          setCloneMatchCandidate(null);
          setCloneDismissedMatchId(null);
          setCloneEmail(value);
        }}
        setCloneDescriptionAction={setCloneDescription}
        formatPhoneAction={formatPhone}
        matchCandidate={cloneMatchCandidate}
        nameMatchCandidates={cloneNameMatchCandidates}
        nameMatchCandidate={cloneNameMatchCandidate}
        nameMatchCount={cloneNameMatchCandidates.length}
        matchedContactId={cloneMatchedContactId}
        linkedContact={cloneMatchedContact}
        searchingContacts={cloneLookupQuery.trim().length >= 2 && isFetchingCloneMatches}
        contactFocusField={cloneContactFocusField}
        onContactFocus={(field) => setCloneContactFocusField(field)}
        onContactBlur={() => setCloneContactFocusField(null)}
        onUseMatch={(contact) => {
          applyCloneMatch(contact);
          setCloneMatchCandidate(null);
          setCloneDismissedMatchId(null);
        }}
        onClearLinkedContact={() => {
          if (cloneMatchedContactId) {
            setCloneDismissedMatchId(cloneMatchedContactId);
          }
          setCloneMatchedContactId(null);
          setCloneMatchedContact(null);
          setCloneMatchCandidate(null);
          setCloneName('');
          setClonePhone('');
          setCloneEmail('');
          setCloneWard('');
        }}
        contactChangeState={cloneChangeState}
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
        initialLicenseOutcome={licenseOutcomePreview}
        onCloseAction={() => {
          setLicenseEvent(null);
          setLicenseOutcomePreview(null);
        }}
        onLicenseOutcomeChangeAction={(eventId, outcome) => {
          setLicenseOutcomeByEvent((prev) => {
            if (!outcome) {
              if (!(eventId in prev)) return prev;
              const next = { ...prev };
              delete next[eventId];
              return next;
            }
            if (prev[eventId] === outcome) {
              return prev;
            }
            return { ...prev, [eventId]: outcome };
          });
        }}
        submitKindooLicenseStatusAction={submitKindooLicenseStatus}
        getLicenseTimesAction={getLicenseTimes}
        formatDateAction={formatDate}
        formatTimeRangeAction={formatTimeRange}
      />
    </TooltipProvider>
  );
}
