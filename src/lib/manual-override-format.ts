import type {
  ManualOverrideAudit,
  ManualOverrideSmsSummary,
  ManualPriorState,
} from '@/lib/manual-override';
import { MANUAL_OVERRIDE_REASON_LABELS, type ManualOverrideReason } from '@/schema/schema';

/**
 * Audit timestamps use the viewer's local time with a zone label (for example
 * "Oct 24, 4:02 AM PDT"), like the other timestamps in the app. Event dates and times stay
 * Mountain wall-clock. The year is shown only when it is not the current year.
 */
export function formatOverrideTimestamp(value: string | number | Date, now: Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'unknown time';
  const showYear = date.getFullYear() !== now.getFullYear();
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(showYear ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function reasonLabel(reason: ManualOverrideReason | null | undefined) {
  return reason ? MANUAL_OVERRIDE_REASON_LABELS[reason] : null;
}

function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** For example: "Handled manually by Spencer, Oct 24, 4:02 AM PDT, worker offline". */
export function buildAuditLine(
  audit: Pick<ManualOverrideAudit, 'handledAt' | 'handledByName' | 'reason' | 'note'>,
  now: Date = new Date()
) {
  const parts = ['Handled manually'];
  if (audit.handledByName) parts[0] += ` by ${audit.handledByName}`;
  if (audit.handledAt) parts.push(formatOverrideTimestamp(audit.handledAt, now));
  const label = reasonLabel(audit.reason);
  if (label) parts.push(lowerFirst(label));
  let line = parts.join(', ');
  if (audit.note) line += `. Note: ${audit.note}`;
  return line;
}

/** What the automation had done when the event was marked, in one sentence. Null if unknown. */
export function describePriorAutomation(
  prior: ManualPriorState | null,
  now: Date = new Date()
): string | null {
  if (!prior) return null;
  const job = prior.job;
  if (!job) {
    return prior.licenseCreated
      ? 'The license was already marked as created.'
      : 'No automation run yet.';
  }
  switch (job.status) {
    case 'queued':
      return 'Automation request was queued, not started.';
    case 'processing':
      return job.claimedAt
        ? `Automation was in progress (claimed ${formatOverrideTimestamp(job.claimedAt, now)}).`
        : 'Automation was in progress.';
    case 'failed':
      return job.lastError
        ? `Automation had failed: ${job.lastError.replace(/\.+$/, '')}.`
        : 'Automation had failed.';
    case 'completed': {
      const when = job.completedAt ? ` at ${formatOverrideTimestamp(job.completedAt, now)}` : '';
      if (job.completionType === 'existing-active-license') {
        return `Automation found an active license already in place${when}.`;
      }
      return `Worker had already granted access${when} (temporary license created).`;
    }
    default:
      return null;
  }
}

export function describeLateWorkerResult(
  result: ManualOverrideAudit['lateWorkerResults'][number],
  now: Date = new Date()
) {
  const when = formatOverrideTimestamp(result.at, now);
  if (result.worker.outcome === 'failed') {
    return `Worker also reported a failure at ${when} after the manual mark.`;
  }
  return result.worker.completionType === 'existing-active-license'
    ? `Worker also finished at ${when} after the manual mark (active license already existed).`
    : `Worker also finished at ${when} after the manual mark and created a license.`;
}

/** One short phrase about the texts a mark or reopen sent, for the history and the toast. */
export function describeSmsSummary(sms: ManualOverrideSmsSummary | null | undefined) {
  if (!sms) return null;
  if (sms.sent > 0) {
    return `Texted ${sms.sent} ${sms.sent === 1 ? 'person' : 'people'}`;
  }
  if (sms.skippedReason === 'sms-not-configured') return 'No texts sent (texting is not set up)';
  if (sms.failed > 0) return 'Texts could not be sent';
  return 'No texts sent (nobody is subscribed)';
}
