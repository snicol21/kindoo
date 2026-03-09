'use client';

import type { EventWithCreator } from '@/actions/events';
import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCw } from 'lucide-react';
import { parseTimeToMinutes } from '@/utils/timeUtils';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/_ui/tooltip';

// ─── Types ────────────────────────────────────────────────────────────────────

type KindooLicenseDialogProps = {
  licenseEvent: EventWithCreator | null;
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

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function getJobStatusVisual(status: LicenseJobStatus) {
  switch (status) {
    case 'processing':
      return {
        label: 'In progress',
        textClassName: 'text-blue-700 dark:text-blue-300',
        badgeClassName:
          'border border-blue-200 bg-blue-100/80 dark:border-blue-700/60 dark:bg-blue-900/30',
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      };
    case 'queued':
      return {
        label: 'Queued',
        textClassName: 'text-blue-700 dark:text-blue-300',
        badgeClassName:
          'border border-blue-200 bg-blue-100/80 dark:border-blue-700/60 dark:bg-blue-900/30',
        icon: <Clock className="h-3.5 w-3.5" />,
      };
    case 'failed':
      return {
        label: 'Failed',
        textClassName: 'text-red-700 dark:text-red-300',
        badgeClassName:
          'border border-red-300 bg-red-100/80 dark:border-red-700/60 dark:bg-red-900/30',
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
      };
    default:
      return {
        label: 'Completed',
        textClassName: 'text-emerald-700 dark:text-emerald-300',
        badgeClassName:
          'border border-emerald-300 bg-emerald-100/80 dark:border-emerald-700/60 dark:bg-emerald-900/30',
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      };
  }
}

const EARLIEST_MINUTES = 5 * 60;

function formatLocalYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDeltaMinutes(deltaMinutes: number) {
  const rounded = Math.round(deltaMinutes);
  if (rounded === 0) return 'on time';
  const abs = Math.abs(rounded);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const minutes = abs % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return `${parts.join(' ')} ${rounded < 0 ? 'early' : 'late'}`;
}

function formatDateTimeNoSeconds(date: Date) {
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCountdownMs(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0)
    return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getScheduledProcessingDateTime(eventDate: string, startTime: string) {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return null;
  const windowStartMinutes = Math.max(EARLIEST_MINUTES, startMinutes - 120);
  const dueMinutes = Math.max(0, windowStartMinutes - 120);
  const h = Math.floor(dueMinutes / 60);
  const min = dueMinutes % 60;
  const dt = new Date(
    `${eventDate}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`
  );
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function getAccessRule(building: EventWithCreator['building']) {
  if (building === 'Stake Center') return 'STAKE CENTER - LIMITED';
  if (building === 'Maples Building') return 'MAPLES BUILDING - LIMITED';
  return null;
}

function buildDescription(event: EventWithCreator) {
  return `[${event.contactWard ?? ''}] - [Private Event] - [${event.contactName ?? ''}]`;
}

// ─── Small presentational pieces ──────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-sm font-medium text-foreground">
      {children}
    </p>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2 odd:bg-muted/30 even:bg-muted/10">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function KindooLicenseDialog({
  licenseEvent,
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

  const [queuedJobId, setQueuedJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<LicenseJobStatus | null>(null);
  const [latestJob, setLatestJob] = useState<LicenseJobSummary | null>(null);
  const [isPollingStatus, setIsPollingStatus] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasAppliedCompletion, setHasAppliedCompletion] = useState(false);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealthSummary | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    submitKindooLicenseStatusRef.current = submitKindooLicenseStatusAction;
  }, [submitKindooLicenseStatusAction]);

  // Reset all state when dialog closes
  useEffect(() => {
    if (!licenseEvent) {
      setQueuedJobId(null);
      setJobStatus(null);
      setLatestJob(null);
      setIsPollingStatus(false);
      setIsRetrying(false);
      setHasAppliedCompletion(false);
      setWorkerHealth(null);
    }
  }, [licenseEvent]);

  // Worker health polling
  useEffect(() => {
    if (!licenseEvent) return;
    let cancelled = false;

    const loadWorkerHealth = async () => {
      try {
        const res = await fetch('/api/license-jobs/worker-health', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const health = data?.health as WorkerHealthSummary | undefined;
        if (health) setWorkerHealth(health);
      } catch {
        // Ignore worker health fetch errors.
      }
    };

    void loadWorkerHealth();
    const interval = globalThis.setInterval(() => {
      if (document.visibilityState === 'visible') void loadWorkerHealth();
    }, 15_000);

    return () => {
      cancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [licenseEvent]);

  // Load latest job on open
  useEffect(() => {
    if (!licenseEvent) return;
    let cancelled = false;
    const loadLatestJob = async () => {
      try {
        const res = await fetch(`/api/license-jobs/event/${licenseEvent.id}/latest`, {
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        const job = data?.job as LicenseJobSummary | null;
        setLatestJob(job ?? null);

        if (job?.status === 'queued' || job?.status === 'processing') {
          setQueuedJobId(job.id);
          setJobStatus(job.status);
          setIsPollingStatus(true);

          if (job.status === 'processing') {
            onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request in progress');
          } else {
            onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request queued');
          }
        }
      } catch {
        // Ignore latest job fetch errors during dialog initialization.
      }
    };

    void loadLatestJob();
    return () => {
      cancelled = true;
    };
  }, [licenseEvent]);

  // Active job polling + SSE
  useEffect(() => {
    if (!queuedJobId || !licenseEvent || !isPollingStatus) return;
    let cancelled = false;

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/license-jobs/${queuedJobId}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to load status.');

        const job = data?.job;
        const nextStatus: LicenseJobStatus | null =
          ['queued', 'processing', 'completed', 'failed'].includes(job?.status)
            ? job.status
            : null;

        if (!nextStatus || cancelled) return;
        setJobStatus(nextStatus);
        setLatestJob(job as LicenseJobSummary);

        if (nextStatus === 'queued') {
          onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request queued');
          return;
        }

        if (nextStatus === 'processing') {
          onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request in progress');
          return;
        }

        if (nextStatus === 'failed') {
          onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Request failed');
          setIsPollingStatus(false);
          return;
        }

        if (nextStatus === 'completed') {
          const ct = typeof job?.completionType === 'string' ? job.completionType : 'temporary-license-created';
          onLicenseOutcomeChangeAction?.(
            licenseEvent.id,
            ct === 'existing-active-license' ? 'Active license already existed' : 'Temporary license created'
          );
          setIsPollingStatus(false);

          if (!hasAppliedCompletion) {
            await submitKindooLicenseStatusRef.current(licenseEvent, true);
            setHasAppliedCompletion(true);
          }
        }
      } catch {
        if (cancelled) return;
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
      if (document.visibilityState !== 'visible' || reconnectTimeout) return;
      reconnectTimeout = globalThis.setTimeout(() => {
        reconnectTimeout = null;
        reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30_000);
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
          const parsed = JSON.parse((rawEvent as MessageEvent).data ?? '{}') as { jobId?: string };
          if (parsed.jobId === queuedJobId) void pollStatus();
        } catch {
          // Ignore malformed stream payloads and rely on polling fallback.
        }
      });
      eventSource.addEventListener('error', () => {
        eventSource?.close();
        scheduleReconnect();
      });
    };

    connectStream();
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = globalThis.setInterval(() => void pollStatus(), 2500);

    return () => {
      cancelled = true;
      globalThis.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearReconnect();
      eventSource?.close();
    };
  }, [queuedJobId, licenseEvent, isPollingStatus, hasAppliedCompletion]);

  // Countdown ticker
  useEffect(() => {
    const interval = globalThis.setInterval(() => setNowMs(Date.now()), 1000);
    return () => globalThis.clearInterval(interval);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────

  const licenseTimes = licenseEvent ? getLicenseTimesAction(licenseEvent) : null;
  const scheduledDateTime = licenseEvent
    ? getScheduledProcessingDateTime(licenseEvent.eventDate, licenseEvent.startTime)
    : null;

  const scheduledDateLabel = scheduledDateTime
    ? formatDateAction(formatLocalYmd(scheduledDateTime))
    : null;
  const scheduledTimeLabel = scheduledDateTime
    ? scheduledDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  const licenseWindowDateLabel = licenseEvent
    ? formatDateAction(licenseEvent.eventDate)
    : (licenseTimes?.startDate ?? null);

  const completionLabel =
    latestJob?.completionType === 'existing-active-license'
      ? 'Existing active license'
      : latestJob?.completionType === 'temporary-license-created'
        ? 'Temporary license created'
        : null;

  const latestDurationSec =
    typeof latestJob?.durationMs === 'number' ? Math.round(latestJob.durationMs / 1000) : null;

  const latestStatusVisual = latestJob ? getJobStatusVisual(latestJob.status) : null;

  const latestRunTimestamp = latestJob?.claimedAt ?? latestJob?.createdAt ?? latestJob?.completedAt ?? null;
  const latestRunDate = latestRunTimestamp ? new Date(latestRunTimestamp) : null;

  const latestFailureMessage = latestJob?.statusDetails ?? latestJob?.lastError ?? null;
  const trimmedFailureMessage = latestFailureMessage
    ? `${latestFailureMessage.slice(0, 140)}${latestFailureMessage.length > 140 ? '…' : ''}`
    : null;

  const runDeltaMinutes =
    latestRunDate && scheduledDateTime
      ? (latestRunDate.getTime() - scheduledDateTime.getTime()) / 60_000
      : null;

  const countdownToScheduledMs = scheduledDateTime ? scheduledDateTime.getTime() - nowMs : null;
  const countdownLabel = countdownToScheduledMs !== null ? formatCountdownMs(countdownToScheduledMs) : null;
  const isScheduledPast = countdownToScheduledMs !== null && countdownToScheduledMs <= 0;

  const canRetryFailedJob =
    (!!queuedJobId && jobStatus === 'failed') || (!queuedJobId && latestJob?.status === 'failed');

  const showWorkerWarning =
    (jobStatus === 'queued' || jobStatus === 'processing') &&
    workerHealth &&
    (workerHealth.status === 'down' || workerHealth.status === 'stale' || workerHealth.status === 'unknown');

  const workerLastSeenLabel = workerHealth?.lastSeenAt
    ? new Date(workerHealth.lastSeenAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  // ── Retry handler ──────────────────────────────────────────────────────────

  const retryFailedJob = async () => {
    const retryJobId = queuedJobId ?? latestJob?.id;
    if (!retryJobId || !licenseEvent) {
      toast.error('No failed job is available to retry.');
      return;
    }

    setIsRetrying(true);

    try {
      const res = await fetch(`/api/license-jobs/${retryJobId}/retry`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to retry request.');

      onLicenseOutcomeChangeAction?.(licenseEvent.id, 'Retry queued');
      setQueuedJobId(retryJobId);
      setJobStatus('queued');
      setIsPollingStatus(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed.');
    } finally {
      setIsRetrying(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={!!licenseEvent} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent
        ref={licenseDialogContentRef}
        tabIndex={-1}
        className="flex max-h-[90vh] flex-col sm:max-w-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => licenseDialogContentRef.current?.focus());
        }}
      >
        <DialogHeader>
          <DialogTitle>Kindoo License</DialogTitle>
          <DialogDescription>
            Automated license request details for this event.
          </DialogDescription>
        </DialogHeader>

        <TooltipProvider delayDuration={200}>
          <div className="flex-1 space-y-5 overflow-y-auto pr-1">
          {licenseEvent && (
            <>
              {/* Event details */}
              <section>
                <SectionLabel>Event</SectionLabel>
                <div className="rounded-md border border-border divide-y divide-border/60">
                  <MetaRow label="Email" value={licenseEvent.contactEmail || <span className="text-destructive">Missing</span>} />
                  <MetaRow label="Description" value={buildDescription(licenseEvent)} />
                  <MetaRow label="Access rule" value={getAccessRule(licenseEvent.building) ?? 'Unknown'} />
                  <MetaRow label="Event time" value={`${formatDateAction(licenseEvent.eventDate)} · ${formatTimeRangeAction(licenseEvent.startTime, licenseEvent.endTime)}`} />
                </div>
              </section>

              {/* Timing */}
              <section>
                <SectionLabel>Timing</SectionLabel>
                <div className="rounded-md border border-border divide-y divide-border/60">
                  <MetaRow
                    label="License window"
                    value={
                      licenseTimes
                        ? `${licenseWindowDateLabel ?? licenseTimes.startDate} · ${licenseTimes.startTime} – ${licenseTimes.endTime}`
                        : 'Unavailable'
                    }
                  />
                  <MetaRow
                    label="Scheduled creation"
                    value={
                      scheduledDateLabel && scheduledTimeLabel
                        ? `${scheduledDateLabel} · ${scheduledTimeLabel}`
                        : 'Auto-scheduled one day before event'
                    }
                  />
                </div>
              </section>

              {/* Scheduled creation status (minimal) */}
              <section>
                <SectionLabel>Scheduled creation status</SectionLabel>
                <div className="rounded-md border border-border bg-background">
                  <div className="divide-y divide-border/60">
                    <MetaRow
                      label="Status"
                      value={
                        <div className="flex items-center justify-end gap-2">
                          {latestJob ? (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${latestStatusVisual?.textClassName} ${latestStatusVisual?.badgeClassName}`}
                            >
                              {latestStatusVisual?.icon}
                              {latestStatusVisual?.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Not started</span>
                          )}
                          {canRetryFailedJob ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={retryFailedJob}
                                  disabled={isRetrying}
                                  aria-label="Retry failed job"
                                >
                                  {isRetrying ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCw className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Retry failed job</TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                      }
                    />
                    <MetaRow
                      label={isScheduledPast ? 'Scheduled time' : 'Time until scheduled'}
                      value={
                        countdownToScheduledMs === null ? (
                          '—'
                        ) : isScheduledPast ? (
                          <span className="text-muted-foreground">Scheduled time reached</span>
                        ) : (
                          <span className="tabular-nums">{countdownLabel}</span>
                        )
                      }
                    />
                    <MetaRow label="Outcome" value={completionLabel ?? initialLicenseOutcome ?? '—'} />
                    <MetaRow label="Duration" value={latestDurationSec !== null ? `${latestDurationSec}s` : '—'} />
                    <MetaRow label="Timing delta" value={runDeltaMinutes !== null ? formatDeltaMinutes(runDeltaMinutes) : '—'} />
                    <MetaRow label="Ran at" value={latestRunDate ? formatDateTimeNoSeconds(latestRunDate) : '—'} />
                  </div>

                  <div className="border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
                    {latestJob?.status === 'failed' && trimmedFailureMessage
                      ? `Failure: ${trimmedFailureMessage}`
                      : 'Status details are available on the scheduled job record.'}
                  </div>
                </div>
              </section>

              {/* Worker health warning */}
              {showWorkerWarning && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">Worker may be offline</p>
                  <p className="mt-1 text-xs opacity-80">
                    {workerHealth?.status === 'unknown'
                      ? 'No worker heartbeat received yet.'
                      : workerHealth?.status === 'stale'
                        ? 'Worker heartbeat is stale — queued jobs may not process.'
                        : 'Worker appears down. Queued jobs may not process automatically.'}
                    {workerHealth?.workerId ? ` Worker: ${workerHealth.workerId}.` : ''}
                    {workerLastSeenLabel ? ` Last seen: ${workerLastSeenLabel}.` : ''}
                  </p>
                </div>
              )}
            </>
          )}
          </div>
        </TooltipProvider>

        <DialogFooter>
          <Button variant="outline" onClick={onCloseAction}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}