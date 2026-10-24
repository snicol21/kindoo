import 'server-only';

import { db } from '@/lib/db';
import type { AccessContext, ActionResult } from '@/lib/events-service';
import { EVENT_TIMEZONE } from '@/lib/events-service';
import { eventEndsInFuture, isDueForQueue } from '@/lib/license-schedule';
import {
  notifyManualOverrideChange,
  type ManualOverrideSmsDeps,
  type ManualOverrideSmsSummary,
} from '@/lib/manual-override-sms';
import {
  canMarkEventHandledManually,
  canViewEvent,
  canViewManualOverrideNote,
} from '@/lib/permissions';
import {
  contacts,
  eventManualOverrideLog,
  events,
  kindooLicenseJobs,
  MANUAL_OVERRIDE_NOTE_MAX_LENGTH,
  MANUAL_OVERRIDE_REASONS,
  users,
  type KindooLicenseCompletionType,
  type KindooLicenseJobStatus,
  type ManualOverrideLogAction,
  type ManualOverrideReason,
} from '@/schema/schema';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

// ─── Types ────────────────────────────────────────────────────────────────────

/** What the automation had done for an event at one moment. Stored as JSON in the log. */
export interface ManualPriorState {
  licenseCreated: boolean;
  job: {
    id: string;
    status: KindooLicenseJobStatus;
    completionType: KindooLicenseCompletionType | null;
    lastError: string | null;
    workerId: string | null;
    attempts: number;
    claimedAt: number | null;
    completedAt: number | null;
  } | null;
}

export interface WorkerResultDetails {
  jobId: string;
  outcome: 'completed' | 'failed';
  completionType?: string | null;
  error?: string | null;
}

export type ManualOverrideLogDetails =
  | { automation: ManualPriorState; sms?: ManualOverrideSmsSummary }
  | { worker: WorkerResultDetails };

export type { ManualOverrideSmsDeps, ManualOverrideSmsSummary };

/** What a mark or reopen returns about the texts it sent (null when none was attempted). */
export type ManualOverrideSmsResult = { sms: ManualOverrideSmsSummary | null };

export type ReopenOutlook = 'will-run-next-cycle' | 'will-queue-when-due' | 'no-automatic-action';

export interface ReopenPreview {
  outlook: ReopenOutlook;
  message: string;
}

export interface ManualOverrideHistoryEntry {
  id: string;
  action: ManualOverrideLogAction;
  at: string;
  actorName: string | null;
  reason: ManualOverrideReason | null;
  /** Only filled for roles that may see notes. */
  note: string | null;
  details: ManualOverrideLogDetails | null;
}

export interface ManualOverrideAudit {
  handled: boolean;
  handledAt: string | null;
  handledByName: string | null;
  reason: ManualOverrideReason | null;
  /** Null for ward roles. */
  note: string | null;
  /** Automation state recorded when the event was marked. */
  prior: ManualPriorState | null;
  /** Automation state right now, whether or not the event is marked. */
  automation: ManualPriorState;
  /** Worker results that landed after the mark (newest first). */
  lateWorkerResults: { at: string; worker: WorkerResultDetails }[];
  /** Full history, only for roles that may see notes (admin, stake_manager). */
  history: ManualOverrideHistoryEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ERROR_SNIPPET_MAX = 300;

function toMs(value: Date | number | null | undefined) {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.getTime() : Number(value);
}

function parseDetails(raw: string | null): ManualOverrideLogDetails | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ManualOverrideLogDetails;
  } catch {
    return null;
  }
}

export function isManualOverrideReason(value: unknown): value is ManualOverrideReason {
  return (
    typeof value === 'string' && (MANUAL_OVERRIDE_REASONS as readonly string[]).includes(value)
  );
}

/** Reads the newest job and the license flag for an event. Read-only. */
export async function snapshotAutomationState(eventId: string): Promise<ManualPriorState> {
  const [event] = await db
    .select({ licenseCreated: events.kindooLicenseCreated })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  const [job] = await db
    .select({
      id: kindooLicenseJobs.id,
      status: kindooLicenseJobs.status,
      completionType: kindooLicenseJobs.completionType,
      lastError: kindooLicenseJobs.lastError,
      workerId: kindooLicenseJobs.workerId,
      attempts: kindooLicenseJobs.attempts,
      claimedAt: kindooLicenseJobs.claimedAt,
      completedAt: kindooLicenseJobs.completedAt,
    })
    .from(kindooLicenseJobs)
    .where(eq(kindooLicenseJobs.eventId, eventId))
    .orderBy(desc(kindooLicenseJobs.createdAt))
    .limit(1);

  return {
    licenseCreated: !!event?.licenseCreated,
    job: job
      ? {
          id: job.id,
          status: job.status,
          completionType: job.completionType ?? null,
          lastError: job.lastError ? job.lastError.slice(0, ERROR_SNIPPET_MAX) : null,
          workerId: job.workerId ?? null,
          attempts: job.attempts,
          claimedAt: toMs(job.claimedAt),
          completedAt: toMs(job.completedAt),
        }
      : null,
  };
}

/** True when an admin has marked the event as handled manually. */
export async function isEventHandledManually(eventId: string) {
  const [row] = await db
    .select({ handledAt: events.manualHandledAt })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  return !!row?.handledAt;
}

/**
 * Records a worker result that arrived for an event that is marked as handled manually. The job
 * row has already been updated by the caller; this only adds the audit row. Never throws.
 */
export async function logWorkerResultAfterOverride(
  eventId: string,
  worker: WorkerResultDetails
): Promise<void> {
  try {
    const details: ManualOverrideLogDetails = {
      worker: { ...worker, error: worker.error ? worker.error.slice(0, ERROR_SNIPPET_MAX) : null },
    };
    await db.insert(eventManualOverrideLog).values({
      eventId,
      action: 'worker_result_after_override',
      details: JSON.stringify(details),
    });
  } catch (error) {
    console.error('[manual-override] Failed to log late worker result:', error);
  }
}

function describeReopenOutlook(
  state: ManualPriorState,
  event: { eventDate: string; startTime: string; endTime: string }
): ReopenPreview {
  const job = state.job;
  if (job) {
    if (job.status === 'queued') {
      return {
        outlook: 'will-run-next-cycle',
        message:
          'A queued automation job exists. The worker will pick it up on its next run and try to grant access.',
      };
    }
    if (job.status === 'processing') {
      return {
        outlook: 'will-run-next-cycle',
        message:
          'An automation job is marked in progress. If it is stuck, it is reset after the stale window and the worker will try to grant access.',
      };
    }
    if (job.status === 'failed') {
      return {
        outlook: 'no-automatic-action',
        message:
          'The last automation attempt failed. Nothing runs automatically. Use Retry if you want the worker to try again.',
      };
    }
    return {
      outlook: 'no-automatic-action',
      message: 'Automation already ran for this event. Nothing will run again.',
    };
  }

  if (state.licenseCreated) {
    return {
      outlook: 'no-automatic-action',
      message: 'The license is already marked as created. Nothing will run.',
    };
  }

  if (isDueForQueue(event.eventDate, event.startTime, event.endTime)) {
    return {
      outlook: 'will-run-next-cycle',
      message:
        'This event is inside its automation window. The worker will queue it on its next run and try to grant access.',
    };
  }

  return {
    outlook: 'will-queue-when-due',
    message: 'The worker will queue this event automatically when it is due.',
  };
}

type EventLookup = {
  id: string;
  userId: string;
  building: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  eventWard: Parameters<typeof canViewEvent>[0]['eventWard'];
  manualHandledAt: Date | null;
};

async function loadEvent(eventId: string): Promise<EventLookup | null> {
  const [row] = await db
    .select({
      id: events.id,
      userId: events.userId,
      building: events.building,
      eventDate: events.eventDate,
      startTime: events.startTime,
      endTime: events.endTime,
      eventWard: contacts.ward,
      manualHandledAt: events.manualHandledAt,
    })
    .from(events)
    .innerJoin(contacts, eq(events.contactId, contacts.id))
    .where(eq(events.id, eventId))
    .limit(1);
  return row ?? null;
}

async function loadActorName(userId: string) {
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name?.trim() || row?.email || 'Admin';
}

function revalidateEventTags(event: { userId: string; building: string }, actorUserId: string) {
  // The change is already committed, so a cache invalidation problem must not fail the request.
  try {
    revalidateTag(`events-${event.userId}`, 'max');
    revalidateTag(`events-${event.userId}-${event.building}`, 'max');
    revalidateTag(`events-${actorUserId}`, 'max');
  } catch (error) {
    console.error('[manual-override] Failed to revalidate event tags:', error);
  }
}

const NOT_ALLOWED = 'Only admins can mark events as handled manually.';
const ENDED = 'This event has already ended, so it can no longer be changed.';

// ─── Actions (called from src/actions/events.ts) ──────────────────────────────

async function recordSmsOnLog(
  logId: string,
  details: Extract<ManualOverrideLogDetails, { automation: ManualPriorState }>,
  sms: ManualOverrideSmsSummary
): Promise<void> {
  try {
    await db
      .update(eventManualOverrideLog)
      .set({ details: JSON.stringify({ ...details, sms }) })
      .where(eq(eventManualOverrideLog.id, logId));
  } catch (error) {
    console.error('[manual-override] Failed to record text summary:', error);
  }
}

async function wasMarkedTextSent(eventId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ details: eventManualOverrideLog.details })
      .from(eventManualOverrideLog)
      .where(
        and(
          eq(eventManualOverrideLog.eventId, eventId),
          eq(eventManualOverrideLog.action, 'marked')
        )
      )
      .orderBy(desc(eventManualOverrideLog.createdAt), desc(sql`rowid`))
      .limit(1);
    const parsed = parseDetails(row?.details ?? null);
    return Boolean(parsed && 'sms' in parsed && parsed.sms && parsed.sms.sent > 0);
  } catch (error) {
    console.error('[manual-override] Failed to read mark text summary:', error);
    return false;
  }
}

export async function markEventHandledManuallyForAccess(
  access: AccessContext,
  input: { eventId: string; reason: string; note?: string | null },
  deps: ManualOverrideSmsDeps = {}
): Promise<ActionResult<ManualOverrideSmsResult>> {
  try {
    if (!canMarkEventHandledManually(access.role)) {
      return { success: false, error: NOT_ALLOWED };
    }

    const eventId = input.eventId?.trim();
    if (!eventId) return { success: false, error: 'Invalid event id.' };

    if (!isManualOverrideReason(input.reason)) {
      return { success: false, error: 'Choose a reason.' };
    }
    const reason = input.reason;
    const note = input.note?.trim() || null;
    if (note && note.length > MANUAL_OVERRIDE_NOTE_MAX_LENGTH) {
      return {
        success: false,
        error: `Note must be ${MANUAL_OVERRIDE_NOTE_MAX_LENGTH} characters or fewer.`,
      };
    }
    if (reason === 'other' && !note) {
      return { success: false, error: 'A note is required when the reason is Other.' };
    }

    const event = await loadEvent(eventId);
    if (!event) return { success: false, error: 'Event not found.' };
    if (!eventEndsInFuture(event.eventDate, event.endTime, EVENT_TIMEZONE)) {
      return { success: false, error: ENDED };
    }
    if (event.manualHandledAt) {
      return { success: false, error: 'This event is already marked as handled manually.' };
    }

    const [prior, actorName] = await Promise.all([
      snapshotAutomationState(event.id),
      loadActorName(access.userId),
    ]);
    const now = new Date();
    const details: ManualOverrideLogDetails = { automation: prior };

    const logId = crypto.randomUUID();
    const marked = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(events)
        .set({
          manualHandledAt: now,
          manualHandledByUserId: access.userId,
          manualReason: reason,
          manualNote: note,
        })
        .where(and(eq(events.id, event.id), isNull(events.manualHandledAt)))
        .returning({ id: events.id });
      if (!updated) return false;

      await tx.insert(eventManualOverrideLog).values({
        id: logId,
        eventId: event.id,
        action: 'marked',
        actorUserId: access.userId,
        actorName,
        reason,
        note,
        details: JSON.stringify(details),
        createdAt: now,
      });
      return true;
    });

    if (!marked) {
      return { success: false, error: 'This event is already marked as handled manually.' };
    }

    revalidateEventTags(event, access.userId);

    // Texts are best effort and never undo or block the mark.
    const sms = await notifyManualOverrideChange(
      { eventId: event.id, actorUserId: access.userId, kind: 'marked', reason },
      deps
    );
    await recordSmsOnLog(logId, details, sms);
    return { success: true, data: { sms } };
  } catch (error) {
    console.error('[markEventHandledManuallyForAccess] Error:', error);
    return { success: false, error: 'Failed to mark the event as handled manually.' };
  }
}

export async function previewReopenForAccess(
  access: AccessContext,
  input: { eventId: string }
): Promise<ActionResult<ReopenPreview>> {
  try {
    if (!canMarkEventHandledManually(access.role)) {
      return { success: false, error: NOT_ALLOWED };
    }
    const event = await loadEvent(input.eventId?.trim() ?? '');
    if (!event) return { success: false, error: 'Event not found.' };
    const state = await snapshotAutomationState(event.id);
    return { success: true, data: describeReopenOutlook(state, event) };
  } catch (error) {
    console.error('[previewReopenForAccess] Error:', error);
    return { success: false, error: 'Failed to load reopen details.' };
  }
}

export async function reopenEventForAutomationForAccess(
  access: AccessContext,
  input: { eventId: string },
  deps: ManualOverrideSmsDeps = {}
): Promise<ActionResult<ReopenPreview & ManualOverrideSmsResult>> {
  try {
    if (!canMarkEventHandledManually(access.role)) {
      return { success: false, error: NOT_ALLOWED };
    }

    const eventId = input.eventId?.trim();
    if (!eventId) return { success: false, error: 'Invalid event id.' };

    const [event, overrideRow] = await Promise.all([
      loadEvent(eventId),
      db
        .select({ reason: events.manualReason, note: events.manualNote })
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    if (!event || !overrideRow) return { success: false, error: 'Event not found.' };
    if (!eventEndsInFuture(event.eventDate, event.endTime, EVENT_TIMEZONE)) {
      return { success: false, error: ENDED };
    }
    if (!event.manualHandledAt) {
      return { success: false, error: 'This event is not marked as handled manually.' };
    }

    const [state, actorName] = await Promise.all([
      snapshotAutomationState(event.id),
      loadActorName(access.userId),
    ]);
    const preview = describeReopenOutlook(state, event);
    const now = new Date();
    const details: ManualOverrideLogDetails = { automation: state };

    const markedTextWasSent = await wasMarkedTextSent(event.id);
    const logId = crypto.randomUUID();
    const reopened = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(events)
        .set({
          manualHandledAt: null,
          manualHandledByUserId: null,
          manualReason: null,
          manualNote: null,
        })
        .where(and(eq(events.id, event.id), isNotNull(events.manualHandledAt)))
        .returning({ id: events.id });
      if (!updated) return false;

      await tx.insert(eventManualOverrideLog).values({
        id: logId,
        eventId: event.id,
        action: 'reopened',
        actorUserId: access.userId,
        actorName,
        reason: overrideRow.reason,
        note: overrideRow.note,
        details: JSON.stringify(details),
        createdAt: now,
      });
      return true;
    });

    if (!reopened) {
      return { success: false, error: 'This event is not marked as handled manually.' };
    }

    revalidateEventTags(event, access.userId);

    // A correction text goes out only if the "handled manually" text actually reached someone.
    // The event is still upcoming here (ended events cannot be reopened).
    let sms: ManualOverrideSmsSummary | null = null;
    if (markedTextWasSent) {
      sms = await notifyManualOverrideChange(
        { eventId: event.id, actorUserId: access.userId, kind: 'reopened' },
        deps
      );
      await recordSmsOnLog(logId, details, sms);
    }
    return { success: true, data: { ...preview, sms } };
  } catch (error) {
    console.error('[reopenEventForAutomationForAccess] Error:', error);
    return { success: false, error: 'Failed to reopen the event.' };
  }
}

export async function getManualOverrideAuditForAccess(
  access: AccessContext,
  input: { eventId: string }
): Promise<ActionResult<ManualOverrideAudit>> {
  try {
    const eventId = input.eventId?.trim();
    if (!eventId) return { success: false, error: 'Invalid event id.' };

    const [event] = await db
      .select({
        id: events.id,
        userId: events.userId,
        eventWard: contacts.ward,
        handledAt: events.manualHandledAt,
        handledByUserId: events.manualHandledByUserId,
        reason: events.manualReason,
        note: events.manualNote,
      })
      .from(events)
      .innerJoin(contacts, eq(events.contactId, contacts.id))
      .where(eq(events.id, eventId))
      .limit(1);

    if (
      !event ||
      !canViewEvent({
        role: access.role,
        userId: access.userId,
        userWard: access.ward,
        eventUserId: event.userId,
        eventWard: event.eventWard,
      })
    ) {
      return { success: false, error: 'Event not found.' };
    }

    const canSeeNote = canViewManualOverrideNote(access.role);
    const logRows = await db
      .select()
      .from(eventManualOverrideLog)
      .where(eq(eventManualOverrideLog.eventId, event.id))
      // createdAt has one-second resolution, so rowid (insert order) breaks ties.
      .orderBy(asc(eventManualOverrideLog.createdAt), asc(sql`rowid`));

    const entries: ManualOverrideHistoryEntry[] = logRows.map((row) => ({
      id: row.id,
      action: row.action,
      at: row.createdAt.toISOString(),
      actorName: row.actorName ?? null,
      reason: row.reason ?? null,
      note: canSeeNote ? (row.note ?? null) : null,
      details: parseDetails(row.details),
    }));

    let handledByName: string | null = null;
    let prior: ManualPriorState | null = null;
    const lateWorkerResults: ManualOverrideAudit['lateWorkerResults'] = [];

    if (event.handledAt) {
      // The newest 'marked' row describes the current override.
      const markIndex = entries.map((entry) => entry.action).lastIndexOf('marked');
      const markEntry = markIndex >= 0 ? entries[markIndex] : null;
      handledByName =
        markEntry?.actorName ??
        (event.handledByUserId ? await loadActorName(event.handledByUserId) : null);
      const markDetails = markEntry?.details;
      prior = markDetails && 'automation' in markDetails ? markDetails.automation : null;

      for (const entry of entries.slice(markIndex + 1)) {
        if (entry.action === 'worker_result_after_override' && entry.details) {
          if ('worker' in entry.details) {
            lateWorkerResults.unshift({ at: entry.at, worker: entry.details.worker });
          }
        }
      }
    }

    return {
      success: true,
      data: {
        handled: !!event.handledAt,
        handledAt: event.handledAt ? event.handledAt.toISOString() : null,
        handledByName,
        reason: event.reason ?? null,
        note: canSeeNote ? (event.note ?? null) : null,
        prior,
        automation: await snapshotAutomationState(event.id),
        lateWorkerResults,
        history: canSeeNote ? [...entries].reverse() : [],
      },
    };
  } catch (error) {
    console.error('[getManualOverrideAuditForAccess] Error:', error);
    return { success: false, error: 'Failed to load the override history.' };
  }
}
