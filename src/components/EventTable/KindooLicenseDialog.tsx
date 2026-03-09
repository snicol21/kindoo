'use client';

import type { EventWithCreator } from '@/actions/events';
import type { MessageTemplateMap } from '@/lib/message-templates';
import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';
import { Textarea } from '@/components/_ui/textarea';
import { renderMessageTemplate } from '@/utils/eventTemplateUtils';
import { AlertTriangle, CheckCircle2, Clock, Copy, Loader2 } from 'lucide-react';
import { parseTimeToMinutes } from '@/utils/timeUtils';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type KindooLicenseDialogProps = {
  licenseEvent: EventWithCreator | null;
  messageTemplates?: MessageTemplateMap;
  initialLicenseOutcome?: string | null;
  onCloseAction: () => void;
  onLicenseOutcomeChangeAction?: (eventId: string, outcome: string | null) => void;
  submitKindooLicenseStatusAction: (event: EventWithCreator, nextValue: boolean) => Promise<void>;
  getLicenseTimesAction: (event: EventWithCreator) => {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
  } | null;
  formatDateAction: (dateStr: string) => string;
  formatTimeRangeAction: (startTime: string, endTime: string) => string;
};

type LicenseJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

type LicenseJobSummary = {
  id: string;
  status: LicenseJobStatus;
  attempts: number;
  completionType?: string | null;
  statusDetails?: string | null;
  durationMs?: number | null;
  sessionReused?: boolean | null;
  lastError?: string | null;
  claimedAt?: string | Date | null;
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type WorkerHealthSummary = {
  status: 'healthy' | 'stale' | 'down' | 'unknown';
  workerId?: string;
  lastSeenAt?: string;
  ageMs?: number;
};

function getJobStatusVisual(status: LicenseJobStatus) {
  if (status === 'processing') {
    return {
      label: 'Retry in progress',
      textClassName: 'text-blue-700 dark:text-blue-300',
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    };
  }
  if (status === 'queued') {
    return {
      label: 'Retry queued',
      textClassName: 'text-blue-700 dark:text-blue-300',
      icon: <Clock className="h-3.5 w-3.5" />,
    };
  }
  if (status === 'failed') {
    return {
      label: 'Retry failed',
      textClassName: 'text-red-700 dark:text-red-300',
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    };
  }
  return {
    label: 'Completed',
    textClassName: 'text-emerald-700 dark:text-emerald-300',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  };
}

const DEFAULT_TIMEZONE = 'America/Denver';
const EARLIEST_MINUTES = 5 * 60;
const LATEST_MINUTES = 23 * 60;

function minutesToTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatLocalYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDeltaMinutes(deltaMinutes: number) {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return 'on time';
  const absMinutes = Math.abs(rounded);
  const days = Math.floor(absMinutes / 1440);
  const hours = Math.floor((absMinutes % 1440) / 60);
  const minutes = absMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  const suffix = rounded < 0 ? 'early' : 'late';
  return `${parts.join(' ')} ${suffix}`;
}

function formatDateTimeNoSeconds(date: Date) {
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getScheduledProcessingDateTime(eventDate: string, startTime: string) {
  const startDateTime = new Date(`${eventDate}T${startTime}:00`);
  if (!Number.isFinite(startDateTime.getTime())) return null;
  const scheduledDateTime = new Date(startDateTime.getTime() - 24 * 60 * 60 * 1000);
  return scheduledDateTime;
}

function getAccessRule(building: EventWithCreator['building']) {
  if (building === 'Stake Center') return 'STAKE CENTER - LIMITED';
  if (building === 'Maples Building') return 'MAPLES BUILDING - LIMITED';
  return null;
}

function buildDescription(event: EventWithCreator) {
  return `[${event.contactWard ?? ''}] - [Private Event] - [${event.contactName ?? ''}]`;
}

export function KindooLicenseDialog({
  licenseEvent,
  messageTemplates,
  initialLicenseOutcome = null,
  onCloseAction,
  onLicenseOutcomeChangeAction,
  submitKindooLicenseStatusAction,
  getLicenseTimesAction,
  formatDateAction,
  formatTimeRangeAction,
}: KindooLicenseDialogProps) {
  const licenseDialogContentRef = useRef<HTMLDivElement | null>(null);
  const submitKindooLicenseStatusRef = useRef(submitKindooLicenseStatusAction);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusDetails, setStatusDetails] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [queuedJobId, setQueuedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<
    'queued' | 'processing' | 'completed' | 'failed' | null
  >(null);
  const [latestJob, setLatestJob] = useState<LicenseJobSummary | null>(null);
  const [workerPollIntervalMs, setWorkerPollIntervalMs] = useState<number | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasAppliedCompletion, setHasAppliedCompletion] = useState(false);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthSummary | null>(null);
  const [isInitializingStatus, setIsInitializingStatus] = useState(false);

  useEffect(() => {
    submitKindooLicenseStatusRef.current = submitKindooLicenseStatusAction;
  }, [submitKindooLicenseStatusAction]);

  useEffect(() => {
    if (!licenseEvent) {
      setStatusType('idle');
      setStatusMessage(null);
      setStatusDetails(null);
      setQueuedJobId(null);
      setJobStatus(null);
      setLatestJob(null);
      setWorkerPollIntervalMs(null);
      setIsPollingStatus(false);
      setIsRetrying(false);
      setHasAppliedCompletion(false);
      setWorkerHealth(null);
      setIsInitializingStatus(false);
    }
  }, [licenseEvent]);

  useEffect(() => {
    if (!licenseEvent) return;

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
        // Ignore worker health fetch errors.
      }
    };

    void loadWorkerHealth();
    const interval = globalThis.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadWorkerHealth();
      }
    }, 15000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [licenseEvent]);

  useEffect(() => {
    if (!licenseEvent) return;

    let cancelled = false;
    setIsInitializingStatus(true);

    const loadLatestJob = async () => {
      try {
        const response = await fetch(`/api/license-jobs/event/${licenseEvent.id}/latest`, {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          return;
        }
        if (cancelled) return;
        const job = data?.job as LicenseJobSummary | null;
        setLatestJob(job ?? null);
        if (job?.status === 'queued' || job?.status === 'processing') {
          setQueuedJobId(job.id);
          setJobStatus(job.status);
          setIsPollingStatus(true);
          setStatusType('loading');
          if (job.status === 'processing') {
            onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request in progress');
            setStatusMessage('Creating temporary license...');
            setStatusDetails('Worker is processing this request now.');
          } else {
            onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request queued');
            setStatusMessage('Request queued.');
            const pollSec =
              typeof data?.workerPollIntervalMs === 'number'
                ? Math.ceil(data.workerPollIntervalMs / 1000)
                : null;
            setStatusDetails(
              pollSec
                ? `Worker checks about every ${pollSec}s, so claim can take up to that long.`
                : 'Waiting for worker to claim this license request.'
            );
          }
        }
        if (typeof data?.workerPollIntervalMs === 'number') {
          setWorkerPollIntervalMs(data.workerPollIntervalMs);
        }
      } catch {
        // Ignore details fetch errors in dialog init.
      } finally {
        if (!cancelled) {
          setIsInitializingStatus(false);
        }
      }
    };

    void loadLatestJob();

    return () => {
      cancelled = true;
    };
  }, [licenseEvent]);

  useEffect(() => {
    if (!queuedJobId || !licenseEvent || !isPollingStatus) return;

    let cancelled = false;

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/license-jobs/${queuedJobId}`, {
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const errorText = typeof data?.error === 'string' ? data.error : 'Failed to load status.';
          throw new Error(errorText);
        }

        const job = data?.job;
        if (typeof data?.workerPollIntervalMs === 'number') {
          setWorkerPollIntervalMs(data.workerPollIntervalMs);
        }
        const nextStatus =
          job?.status === 'queued' ||
          job?.status === 'processing' ||
          job?.status === 'completed' ||
          job?.status === 'failed'
            ? job.status
            : null;

        if (!nextStatus || cancelled) return;

        setJobStatus(nextStatus);
        setLatestJob(job as LicenseJobSummary);

        if (nextStatus === 'queued') {
          onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request queued');
          setStatusType('loading');
          setStatusMessage('Request queued.');
          const pollSec =
            typeof data?.workerPollIntervalMs === 'number'
              ? Math.ceil(data.workerPollIntervalMs / 1000)
              : workerPollIntervalMs
                ? Math.ceil(workerPollIntervalMs / 1000)
                : null;
          const waitHint = pollSec
            ? `Worker checks about every ${pollSec}s, so claim can take up to that long.`
            : 'Waiting for worker to claim this license request.';
          setStatusDetails(waitHint);
          return;
        }

        if (nextStatus === 'processing') {
          onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request in progress');
          setStatusType('loading');
          setStatusMessage('Creating temporary license...');
          setStatusDetails('Worker is processing this request now.');
          return;
        }

        if (nextStatus === 'failed') {
          onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request failed');
          setStatusType('error');
          setStatusMessage('License request failed.');
          const details =
            typeof job?.lastError === 'string' && job.lastError.trim().length > 0
              ? job.lastError
              : 'The worker reported a failure.';
          setStatusDetails(details);
          setIsPollingStatus(false);
          return;
        }

        if (nextStatus === 'completed') {
          setStatusType('success');
          const completionType =
            typeof job?.completionType === 'string'
              ? job.completionType
              : 'temporary-license-created';
          if (completionType === 'existing-active-license') {
            onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Active license already existed');
          } else {
            onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Temporary license created');
          }
          const completedMessage =
            completionType === 'existing-active-license'
              ? 'User already has an active Kindoo license.'
              : 'Temporary Kindoo license created successfully.';
          const durationText =
            typeof job?.durationMs === 'number' ? ` (${Math.round(job.durationMs / 1000)}s)` : '';
          setStatusMessage(`${completedMessage}${durationText}`);
          setStatusDetails(typeof job?.statusDetails === 'string' ? job.statusDetails : null);
          setIsPollingStatus(false);

          if (!hasAppliedCompletion) {
            await submitKindooLicenseStatusRef.current(licenseEvent, true);
            setHasAppliedCompletion(true);
          }
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to load request status.';
        setStatusType('error');
        setStatusMessage('Unable to refresh request status.');
        setStatusDetails(message);
      }
    };

    void pollStatus();

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
            jobId?: string;
          };
          if (parsed.jobId !== queuedJobId) return;
          void pollStatus();
        } catch {
          // Ignore stream parse errors and keep polling fallback.
        }
      });
      eventSource.addEventListener('error', () => {
        eventSource?.close();
        scheduleReconnect();
      });
    };

    connectStream();
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = globalThis.setInterval(() => {
      void pollStatus();
    }, 2500);

    return () => {
      cancelled = true;
      globalThis.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearReconnect();
      eventSource?.close();
    };
  }, [queuedJobId, licenseEvent, isPollingStatus, hasAppliedCompletion]);

  const requestPayload = useMemo(() => {
    if (!licenseEvent) return null;
    const startMinutes = parseTimeToMinutes(licenseEvent.startTime);
    const endMinutes = parseTimeToMinutes(licenseEvent.endTime);
    if (startMinutes === null || endMinutes === null) return null;
    const start = Math.max(EARLIEST_MINUTES, startMinutes - 120);
    const end = Math.min(LATEST_MINUTES, endMinutes + 120);
    const accessRule = getAccessRule(licenseEvent.building);
    if (!accessRule) return null;

    return {
      eventId: licenseEvent.id,
      email: licenseEvent.contactEmail ?? '',
      description: buildDescription(licenseEvent),
      timezone: DEFAULT_TIMEZONE,
      startDate: licenseEvent.eventDate,
      startTime: minutesToTime(start),
      endDate: licenseEvent.eventDate,
      endTime: minutesToTime(end),
      kindooAccessRule: accessRule,
    };
  }, [licenseEvent]);

  const completionLabel =
    latestJob?.completionType === 'existing-active-license'
      ? 'Existing active license'
      : latestJob?.completionType === 'temporary-license-created'
        ? 'Temporary license created'
        : null;
  const isLicenseCompleted =
    !!licenseEvent?.kindooLicenseCreated ||
    latestJob?.completionType === 'existing-active-license' ||
    latestJob?.completionType === 'temporary-license-created';
  const latestDurationSec =
    typeof latestJob?.durationMs === 'number'
      ? Math.round((latestJob.durationMs ?? 0) / 1000)
      : null;
  const latestStatusVisual = latestJob ? getJobStatusVisual(latestJob.status) : null;
  const showWorkerHealthWarning =
    jobStatus === 'queued' ||
    jobStatus === 'processing' ||
    latestJob?.status === 'queued' ||
    latestJob?.status === 'processing';
  const workerLastSeenLabel = workerHealth?.lastSeenAt
    ? new Date(workerHealth.lastSeenAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const licenseTimes = licenseEvent ? getLicenseTimesAction(licenseEvent) : null;
  const scheduledDateTime = licenseEvent
    ? getScheduledProcessingDateTime(licenseEvent.eventDate, licenseEvent.startTime)
    : null;
  const licenseWindowDateLabel = licenseEvent
    ? formatDateAction(licenseEvent.eventDate)
    : (licenseTimes?.startDate ?? null);
  const scheduledDateLabel = scheduledDateTime
    ? formatDateAction(formatLocalYmd(scheduledDateTime))
    : null;
  const scheduledTimeLabel = scheduledDateTime
    ? scheduledDateTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;
  const latestRunTimestamp =
    latestJob?.claimedAt ?? latestJob?.createdAt ?? latestJob?.completedAt ?? null;
  const latestRunDate = latestRunTimestamp ? new Date(latestRunTimestamp) : null;
  const runDeltaMinutes =
    latestRunDate && scheduledDateTime
      ? (latestRunDate.getTime() - scheduledDateTime.getTime()) / (1000 * 60)
      : null;
  const licenseCreatedMessage = licenseEvent
    ? renderMessageTemplate(licenseEvent, 'license_created', messageTemplates)
    : '';
  const showActionButtons = !isInitializingStatus;
  const showMessageSection =
    latestJob?.status === 'completed' && latestJob?.completionType === 'temporary-license-created';
  const messagePlaceholderOutcomes = new Set(['Temporary license created']);
  const statusPlaceholderOutcomes = new Set([
    'Request queued',
    'Request in progress',
    'Request failed',
    'Retry queued',
    'Retry in progress',
    'Retry failed',
    'Temporary license created',
    'Active license already existed',
    'License created',
  ]);
  const hideStatusSectionForOutcome =
    initialLicenseOutcome === 'Auto-schedule pending' ||
    initialLicenseOutcome === 'Scheduled for license';
  const showScheduledStatusSection =
    !!latestJob || (isInitializingStatus && !hideStatusSectionForOutcome);
  const shouldRenderMessageSection =
    showMessageSection ||
    (initialLicenseOutcome !== null && messagePlaceholderOutcomes.has(initialLicenseOutcome));
  const shouldRenderStatusSection =
    showScheduledStatusSection ||
    (initialLicenseOutcome !== null && statusPlaceholderOutcomes.has(initialLicenseOutcome));

  const queueLicenseRequest = async () => {
    if (!licenseEvent || !requestPayload) {
      toast.error('License details are incomplete.');
      return;
    }
    if (!requestPayload.email) {
      toast.error('An email is required to request a license.');
      return;
    }

    setStatusType('loading');
    setStatusMessage('Submitting temporary license request...');
    setStatusDetails('This can take up to a few minutes while automation runs.');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/license-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await response.json().catch(() => ({}));
      const requestId = typeof data?.requestId === 'string' ? data.requestId : null;
      if (!response.ok) {
        const errorText = typeof data?.error === 'string' ? data.error : null;
        const detailsText = typeof data?.details === 'string' ? data.details : null;
        const message = [errorText, detailsText]
          .filter((value): value is string => Boolean(value))
          .join(' ');
        const suffix = requestId ? ` (request ${requestId})` : '';
        throw new Error((message || 'Failed to request the license.') + suffix);
      }

      const mode = typeof data?.mode === 'string' ? data.mode : 'direct';
      if (typeof data?.workerPollIntervalMs === 'number') {
        setWorkerPollIntervalMs(data.workerPollIntervalMs);
      }

      if (mode === 'queue') {
        const jobId = typeof data?.jobId === 'string' ? data.jobId : null;
        onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request queued');
        setStatusType('success');
        setStatusMessage('Temporary license request queued.');
        const pollSec =
          typeof data?.workerPollIntervalMs === 'number'
            ? Math.ceil(data.workerPollIntervalMs / 1000)
            : null;
        setStatusDetails(
          requestId
            ? `Request ${requestId} queued. Typical processing is ~10-30s once claimed${pollSec ? `, and the worker checks about every ${pollSec}s.` : '.'}`
            : `Queued for your local worker.${pollSec ? ` Worker checks about every ${pollSec}s.` : ''}`
        );
        setQueuedJobId(jobId);
        setJobStatus('queued');
        setIsPollingStatus(true);
        toast.success('License request queued.');
        return;
      }

      setStatusType('success');
      setStatusMessage('Temporary license requested successfully.');
      setStatusDetails(
        requestId
          ? `Request ${requestId} accepted. Marking the event as completed...`
          : 'Marking the event as completed...'
      );
      toast.success('Temporary license requested.');
      await submitKindooLicenseStatusAction(licenseEvent, true);
      setStatusDetails(requestId ? `Done. Request ${requestId} completed.` : 'Done.');
      onCloseAction();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed.';
      setStatusType('error');
      setStatusMessage('Temporary license request failed.');
      setStatusDetails(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!licenseEvent} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent
        ref={licenseDialogContentRef}
        tabIndex={-1}
        className="sm:max-w-3xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            licenseDialogContentRef.current?.focus();
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>Kindoo License</DialogTitle>
          <DialogDescription>Confirm the automation request details.</DialogDescription>
        </DialogHeader>
        {licenseEvent && (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium text-foreground">Temporary Kindoo license</p>
              <p className="text-muted-foreground">
                {formatDateAction(licenseEvent.eventDate)} ·{' '}
                {formatTimeRangeAction(licenseEvent.startTime, licenseEvent.endTime)}
              </p>
            </div>
            {isInitializingStatus && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading license status...
              </div>
            )}
            <div className="space-y-2">
              <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">Timing overview</p>
                <div className="mt-1.5 grid rounded-md bg-muted/40 divide-y divide-dashed divide-border/60 text-xs sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <div className="px-5 py-2">
                    <p className="text-xs text-muted-foreground">Scheduled creation</p>
                    {scheduledDateLabel && scheduledTimeLabel ? (
                      <>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {scheduledDateLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">{scheduledTimeLabel}</p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Auto-scheduling runs one day before the event start.
                      </p>
                    )}
                  </div>
                  <div className="px-5 py-2">
                    <p className="text-xs text-muted-foreground">License window</p>
                    {licenseTimes ? (
                      <>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {licenseWindowDateLabel ?? licenseTimes.startDate}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {licenseTimes.startTime} – {licenseTimes.endTime}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">Unavailable</p>
                    )}
                  </div>
                  <div className="px-5 py-2">
                    <p className="text-xs text-muted-foreground">Event time</p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {formatDateAction(licenseEvent.eventDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeRangeAction(licenseEvent.startTime, licenseEvent.endTime)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-border px-3 py-2 text-sm">
                <p className="font-medium text-foreground">Event details</p>
                <div className="mt-1.5 grid gap-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium text-foreground sm:text-right break-words">
                      {licenseEvent.contactEmail || 'Missing email'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="text-muted-foreground">Description</span>
                    <span className="font-medium text-foreground sm:text-right break-words">
                      {buildDescription(licenseEvent)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <span className="text-muted-foreground">Access rule</span>
                    <span className="font-medium text-foreground sm:text-right break-words">
                      {getAccessRule(licenseEvent.building) ?? 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
              {shouldRenderMessageSection && (
                <div className="rounded-md border border-border px-3 py-2 text-sm min-h-[170px]">
                  <p className="font-medium text-foreground">Message to attendee</p>
                  {showMessageSection ? (
                    <>
                      <Textarea
                        readOnly
                        rows={4}
                        className="mt-2 min-h-24"
                        value={licenseCreatedMessage}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-2"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(licenseCreatedMessage);
                            toast.success('Message copied.');
                          } catch {
                            toast.error('Failed to copy message.');
                          }
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy message
                      </Button>
                    </>
                  ) : (
                    <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                      <p>No attendee message yet. It will appear after a license is created.</p>
                      {isInitializingStatus && (
                        <div className="space-y-1" aria-hidden="true">
                          <div className="h-4 w-full rounded bg-muted/60" />
                          <div className="h-4 w-11/12 rounded bg-muted/60" />
                          <div className="h-4 w-9/12 rounded bg-muted/60" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {shouldRenderStatusSection && (
              <div className="min-h-[164px] rounded-md border border-border bg-background/60 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">Scheduled creation status</p>
                {showScheduledStatusSection ? (
                  isInitializingStatus && !latestJob ? (
                    <div className="mt-1.5 grid gap-3 text-xs sm:grid-cols-2">
                      <p className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading status details...
                      </p>
                      <p className="text-muted-foreground">Outcome: —</p>
                      <p className="text-muted-foreground">Duration: —</p>
                      <p className="text-muted-foreground">Attempts: —</p>
                      <p className="text-muted-foreground">Updated: —</p>
                      <p className="text-muted-foreground">Ran at: —</p>
                      <p className="text-muted-foreground">Timing delta: —</p>
                    </div>
                  ) : (
                    <>
                      <div className="mt-1.5 grid gap-3 text-xs sm:grid-cols-2">
                        <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <span
                            className={`inline-flex items-center gap-1 font-medium sm:text-right ${latestStatusVisual?.textClassName ?? 'text-foreground'}`}
                          >
                            {latestStatusVisual?.icon}
                            {latestStatusVisual?.label}
                          </span>
                        </p>
                        <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">Outcome:</span>
                          <span className="font-medium text-foreground sm:text-right">
                            {completionLabel ?? '—'}
                          </span>
                        </p>
                        <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="font-medium text-foreground sm:text-right">
                            {latestDurationSec !== null ? `${latestDurationSec}s` : '—'}
                          </span>
                        </p>
                        <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">Attempts:</span>
                          <span className="font-medium text-foreground sm:text-right">
                            {latestJob?.attempts ?? '—'}
                          </span>
                        </p>
                        <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">Updated:</span>
                          <span className="font-medium text-foreground sm:text-right">
                            {latestJob?.updatedAt
                              ? formatDateTimeNoSeconds(new Date(latestJob.updatedAt))
                              : '—'}
                          </span>
                        </p>
                        <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">Ran at:</span>
                          <span className="font-medium text-foreground sm:text-right">
                            {latestRunDate ? formatDateTimeNoSeconds(latestRunDate) : '—'}
                          </span>
                        </p>
                        <p className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-muted-foreground">Timing delta:</span>
                          <span className="font-medium text-foreground sm:text-right">
                            {runDeltaMinutes !== null ? formatDeltaMinutes(runDeltaMinutes) : '—'}
                          </span>
                        </p>
                      </div>
                      {latestJob?.status === 'failed' &&
                        (latestJob.statusDetails || latestJob.lastError) && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {latestJob.statusDetails || latestJob.lastError}
                          </p>
                        )}
                      {statusType !== 'idle' && (
                        <div
                          className={`mt-2 rounded-md border-t px-3 py-2 text-sm ${
                            statusType === 'loading'
                              ? 'border-blue-100 bg-blue-50 text-blue-900 dark:border-blue-800/40 dark:bg-blue-950/40 dark:text-blue-100'
                              : statusType === 'success'
                                ? 'border-emerald-100 bg-emerald-50 text-emerald-900 dark:border-emerald-800/40 dark:bg-emerald-950/40 dark:text-emerald-100'
                                : 'border-red-100 bg-red-50 text-red-900 dark:border-red-800/40 dark:bg-red-950/40 dark:text-red-100'
                          }`}
                        >
                          <p
                            className={`font-medium ${statusType === 'loading' ? 'animate-pulse' : ''}`}
                          >
                            {statusMessage}
                          </p>
                          {statusDetails && (
                            <p className="mt-1 wrap-break-word text-xs opacity-90">
                              {statusDetails}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                    <p>No scheduled creation yet. Status details appear once a job is created.</p>
                    {isInitializingStatus && (
                      <div className="grid gap-2 sm:grid-cols-2" aria-hidden="true">
                        <div className="h-4 rounded bg-muted/60" />
                        <div className="h-4 rounded bg-muted/60" />
                        <div className="h-4 rounded bg-muted/60" />
                        <div className="h-4 rounded bg-muted/60" />
                        <div className="h-4 rounded bg-muted/60" />
                        <div className="h-4 rounded bg-muted/60" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {showWorkerHealthWarning &&
              workerHealth &&
              (workerHealth.status === 'down' ||
                workerHealth.status === 'stale' ||
                workerHealth.status === 'unknown') && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">Worker may be offline.</p>
                  <p className="mt-1 text-xs">
                    {workerHealth.status === 'unknown'
                      ? 'No worker heartbeat has been received yet.'
                      : workerHealth.status === 'stale'
                        ? 'Worker heartbeat is stale and may not be processing queued jobs.'
                        : 'Worker appears down, so queued jobs might not process automatically.'}
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    {workerHealth.workerId ? `Worker: ${workerHealth.workerId}. ` : ''}
                    {workerLastSeenLabel ? `Last seen: ${workerLastSeenLabel}. ` : ''}
                    If needed, run the worker manually to process these requests.
                  </p>
                </div>
              )}
          </div>
        )}
        <DialogFooter className="flex-col items-start gap-2 sm:flex-row sm:items-center">
          {showActionButtons && isLicenseCompleted && !queuedJobId && !isPollingStatus && (
            <p className="w-full max-w-[28rem] text-xs text-muted-foreground sm:mr-auto sm:w-auto sm:max-w-none">
              This event already has a license.
              <br />
              Retry only after a Kindoo manager removes it.
            </p>
          )}
          {showActionButtons && !isLicenseCompleted && !queuedJobId && !isPollingStatus && (
            <p className="w-full max-w-[28rem] text-xs text-amber-700 dark:text-amber-300 sm:mr-auto sm:w-auto sm:max-w-none">
              Early override: creating now may consume a Kindoo license seat sooner than needed.
            </p>
          )}
          {!showActionButtons && (
            <p className="w-full max-w-[28rem] text-xs text-muted-foreground sm:mr-auto sm:w-auto sm:max-w-none">
              Loading latest status...
            </p>
          )}
          <Button variant="outline" className="w-full sm:w-auto" onClick={onCloseAction}>
            Cancel
          </Button>
          {showActionButtons &&
          ((queuedJobId && jobStatus === 'failed') ||
            (!queuedJobId && latestJob?.status === 'failed')) ? (
            <Button
              className="w-full sm:w-auto"
              disabled={isRetrying}
              onClick={async () => {
                const retryJobId = queuedJobId ?? latestJob?.id;
                if (!retryJobId) {
                  toast.error('No failed job found to retry.');
                  return;
                }
                setIsRetrying(true);
                try {
                  const response = await fetch(`/api/license-jobs/${retryJobId}/retry`, {
                    method: 'POST',
                  });
                  const data = await response.json().catch(() => ({}));
                  if (!response.ok) {
                    const errorText =
                      typeof data?.error === 'string' ? data.error : 'Failed to retry request.';
                    throw new Error(errorText);
                  }

                  if (!licenseEvent) {
                    toast.error('Event details are no longer available.');
                    return;
                  }

                  setStatusType('loading');
                  setStatusMessage('Retry queued.');
                  setStatusDetails('Worker will retry this license request.');
                  onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Retry queued');
                  setQueuedJobId(retryJobId);
                  setJobStatus('queued');
                  setIsPollingStatus(true);
                  toast.success('Retry queued.');
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'Retry failed.';
                  setStatusType('error');
                  setStatusMessage('Retry failed.');
                  setStatusDetails(message);
                  toast.error(message);
                } finally {
                  setIsRetrying(false);
                }
              }}
            >
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          ) : null}
          {showActionButtons && isLicenseCompleted && !queuedJobId && !isPollingStatus && (
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={isSubmitting}
              onClick={queueLicenseRequest}
            >
              {isSubmitting ? 'Queueing...' : 'Retry anyway'}
            </Button>
          )}
          {showActionButtons && !isLicenseCompleted && (
            <Button
              variant="outline"
              className="w-full border-amber-400 bg-amber-100 text-amber-900 hover:border-amber-500 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:border-amber-500 dark:hover:bg-amber-900/60 sm:w-auto"
              disabled={!licenseEvent || isSubmitting || !!queuedJobId}
              onClick={queueLicenseRequest}
            >
              {!isSubmitting && !(queuedJobId && isPollingStatus) && (
                <AlertTriangle className="mr-2 h-4 w-4" />
              )}
              {isSubmitting
                ? 'Requesting...'
                : queuedJobId && isPollingStatus
                  ? 'Processing...'
                  : 'Create early license now'}
            </Button>
          )}
          {!showActionButtons && (
            <Button variant="outline" className="w-full sm:w-auto" disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading status...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
