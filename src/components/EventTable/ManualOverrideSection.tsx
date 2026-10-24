'use client';

import {
  getEventManualOverrideAudit,
  type EventWithCreator,
  type ManualOverrideAudit,
} from '@/actions/events';
import { Button } from '@/components/_ui/button';
import { eventEndsInFuture } from '@/lib/license-schedule';
import {
  buildAuditLine,
  describeLateWorkerResult,
  describePriorAutomation,
  describeSmsSummary,
  formatOverrideTimestamp,
  reasonLabel,
} from '@/lib/manual-override-format';
import { Hand } from 'lucide-react';
import { useEffect, useState } from 'react';

type ManualOverrideSectionProps = {
  event: EventWithCreator;
  /** Admin only. Hides every control for other roles. */
  canMark: boolean;
  onOpenOverrideAction: (event: EventWithCreator, mode: 'mark' | 'reopen') => void;
};

export function ManualOverrideSection({
  event,
  canMark,
  onOpenOverrideAction,
}: ManualOverrideSectionProps) {
  const [audit, setAudit] = useState<ManualOverrideAudit | null>(null);
  const handledAtKey = event.manualHandledAt ? new Date(event.manualHandledAt).getTime() : null;
  const isHandled = handledAtKey !== null;
  const isUpcoming = eventEndsInFuture(event.eventDate, event.endTime);

  useEffect(() => {
    // Ward roles only need the audit line for events that are marked. Admins also load the
    // history so they can see earlier marks and reopens.
    if (!isHandled && !canMark) {
      setAudit(null);
      return;
    }
    let cancelled = false;
    void getEventManualOverrideAudit({ eventId: event.id }).then((result) => {
      if (!cancelled) setAudit(result.success && result.data ? result.data : null);
    });
    return () => {
      cancelled = true;
    };
  }, [event.id, handledAtKey, isHandled, canMark]);

  const showMark = canMark && !isHandled && isUpcoming;
  const showReopen = canMark && isHandled && isUpcoming;
  const history = audit?.history ?? [];

  if (!isHandled && !showMark && history.length === 0) return null;

  return (
    <section>
      <p className="mb-2 text-sm font-medium text-foreground">Handled manually</p>
      <div className="space-y-3 rounded-md border border-border px-4 py-3">
        {isHandled ? (
          <div className="space-y-1.5 text-xs">
            <p className="flex items-start gap-1.5 font-medium text-violet-700 dark:text-violet-300">
              <Hand className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span data-testid="manual-audit-line">
                {audit
                  ? buildAuditLine(audit)
                  : `Handled manually${reasonLabel(event.manualReason) ? `, ${reasonLabel(event.manualReason)?.toLowerCase()}` : ''}`}
              </span>
            </p>
            {audit && describePriorAutomation(audit.prior) && (
              <p className="text-muted-foreground">{describePriorAutomation(audit.prior)}</p>
            )}
            {audit?.lateWorkerResults.map((result) => (
              <p key={result.at} className="text-amber-700 dark:text-amber-300">
                {describeLateWorkerResult(result)}
              </p>
            ))}
            <p className="text-muted-foreground">
              The worker skips this event. Nothing was revoked.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Granted access in Kindoo yourself, or the worker is offline? Mark this event and the
            worker will skip it.
          </p>
        )}

        {(showMark || showReopen) && (
          <div className="flex flex-wrap gap-2">
            {showMark && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenOverrideAction(event, 'mark')}
              >
                <Hand className="h-3.5 w-3.5" />
                Mark as handled manually
              </Button>
            )}
            {showReopen && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenOverrideAction(event, 'reopen')}
              >
                Reopen for automation
              </Button>
            )}
          </div>
        )}

        {history.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">History</summary>
            <ul className="mt-2 space-y-1.5">
              {history.map((entry) => (
                <li key={entry.id} className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {entry.action === 'marked'
                      ? 'Marked'
                      : entry.action === 'reopened'
                        ? 'Reopened'
                        : 'Worker result'}
                  </span>
                  {', '}
                  {formatOverrideTimestamp(entry.at)}
                  {entry.actorName ? `, ${entry.actorName}` : ''}
                  {entry.action !== 'worker_result_after_override' && reasonLabel(entry.reason)
                    ? `, ${reasonLabel(entry.reason)?.toLowerCase()}`
                    : ''}
                  {entry.note ? `. Note: ${entry.note}` : ''}
                  {entry.details && 'worker' in entry.details
                    ? `. ${describeLateWorkerResult({ at: entry.at, worker: entry.details.worker })}`
                    : ''}
                  {entry.details && 'automation' in entry.details && entry.details.sms
                    ? `. ${describeSmsSummary(entry.details.sms)}`
                    : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
