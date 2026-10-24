'use client';

import {
  getEventManualOverrideAudit,
  previewReopenEventForAutomation,
  type EventWithCreator,
  type ReopenPreview,
} from '@/actions/events';
import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';
import { Label } from '@/components/_ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import { Textarea } from '@/components/_ui/textarea';
import { useMarkEventHandledManually, useReopenEventForAutomation } from '@/hooks/useEvents';
import { describePriorAutomation, describeSmsSummary } from '@/lib/manual-override-format';
import {
  MANUAL_OVERRIDE_NOTE_MAX_LENGTH,
  MANUAL_OVERRIDE_REASONS,
  MANUAL_OVERRIDE_REASON_LABELS,
  type ManualOverrideReason,
} from '@/schema/schema';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export type ManualOverrideDialogState = {
  event: EventWithCreator;
  mode: 'mark' | 'reopen';
} | null;

type ManualOverrideDialogProps = {
  state: ManualOverrideDialogState;
  onCloseAction: () => void;
  formatDateAction: (dateStr: string) => string;
  formatTimeRangeAction: (startTime: string, endTime: string) => string;
};

export function ManualOverrideDialog({
  state,
  onCloseAction,
  formatDateAction,
  formatTimeRangeAction,
}: ManualOverrideDialogProps) {
  const markMutation = useMarkEventHandledManually();
  const reopenMutation = useReopenEventForAutomation();

  const [reason, setReason] = useState<ManualOverrideReason | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [priorSummary, setPriorSummary] = useState<string | null>(null);
  const [reopenPreview, setReopenPreview] = useState<ReopenPreview | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  const event = state?.event ?? null;
  const mode = state?.mode ?? null;
  const eventId = event?.id ?? null;
  const isSaving = markMutation.isPending || reopenMutation.isPending;

  // Reset the form each time the dialog opens for an event.
  useEffect(() => {
    setReason('');
    setNote('');
    setError(null);
    setPriorSummary(null);
    setReopenPreview(null);
  }, [eventId, mode]);

  // Mark: show what the automation has done so far, so the admin sees what will be recorded.
  // Reopen: ask the server what the worker will do next.
  useEffect(() => {
    if (!eventId || !mode) return;
    let cancelled = false;
    setIsLoadingContext(true);

    const load = async () => {
      try {
        if (mode === 'reopen') {
          const result = await previewReopenEventForAutomation({ eventId });
          if (!cancelled && result.success && result.data) setReopenPreview(result.data);
        } else {
          // The audit action also returns the current automation snapshot.
          const result = await getEventManualOverrideAudit({ eventId });
          if (!cancelled && result.success && result.data) {
            setPriorSummary(describePriorAutomation(result.data.automation));
          }
        }
      } finally {
        if (!cancelled) setIsLoadingContext(false);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [eventId, mode]);

  const noteTooLong = note.length > MANUAL_OVERRIDE_NOTE_MAX_LENGTH;
  const noteRequired = reason === 'other';
  const canSubmitMark = !!reason && !noteTooLong && (!noteRequired || note.trim().length > 0);

  const submitMark = async () => {
    if (!event || !reason) return;
    setError(null);
    try {
      const result = await markMutation.mutateAsync({
        eventId: event.id,
        reason,
        note: note.trim() || null,
      });
      const texted = describeSmsSummary(result.sms);
      toast.success(
        `Marked as handled manually. The worker will skip this event.${texted ? ` ${texted}.` : ''}`
      );
      onCloseAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark the event.');
    }
  };

  const submitReopen = async () => {
    if (!event) return;
    setError(null);
    try {
      const result = await reopenMutation.mutateAsync({ eventId: event.id });
      const texted = describeSmsSummary(result.sms);
      toast.success(`Reopened for automation.${texted ? ` ${texted}.` : ''}`);
      onCloseAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen the event.');
    }
  };

  return (
    <Dialog
      open={!!state}
      onOpenChange={(open) => {
        if (!open && !isSaving) onCloseAction();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {event && mode === 'mark' && (
          <>
            <DialogHeader>
              <DialogTitle>Mark as handled manually</DialogTitle>
              <DialogDescription>
                {event.contactName} · {formatDateAction(event.eventDate)} ·{' '}
                {formatTimeRangeAction(event.startTime, event.endTime)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The worker will skip this event from now on. Nothing is revoked, and a grant that is
                already running cannot be undone. You can reopen it later.
              </p>
              <p className="text-sm text-muted-foreground">
                People who are subscribed to texts for this event get a short text that Kindoo
                access is taken care of and nothing is needed from them. Your note is never
                included.
              </p>

              <div className="space-y-2">
                <Label htmlFor="manual-reason">Reason</Label>
                <Select
                  value={reason}
                  onValueChange={(value) => setReason(value as ManualOverrideReason)}
                >
                  <SelectTrigger id="manual-reason">
                    <SelectValue placeholder="Choose a reason…" />
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_OVERRIDE_REASONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {MANUAL_OVERRIDE_REASON_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual-note">
                  Note {noteRequired ? '(required)' : '(optional)'}
                </Label>
                <Textarea
                  id="manual-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={MANUAL_OVERRIDE_NOTE_MAX_LENGTH + 50}
                  rows={3}
                  placeholder="Anything worth remembering about this one"
                />
                <p
                  className={`text-xs ${noteTooLong ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {note.length}/{MANUAL_OVERRIDE_NOTE_MAX_LENGTH}
                </p>
              </div>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {isLoadingContext
                  ? 'Checking automation state…'
                  : priorSummary
                    ? `Will be recorded: ${priorSummary}`
                    : 'The current automation state will be recorded with this change.'}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onCloseAction} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={submitMark} disabled={!canSubmitMark || isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark as handled manually
              </Button>
            </DialogFooter>
          </>
        )}

        {event && mode === 'reopen' && (
          <>
            <DialogHeader>
              <DialogTitle>Reopen for automation</DialogTitle>
              <DialogDescription>
                {event.contactName} · {formatDateAction(event.eventDate)} ·{' '}
                {formatTimeRangeAction(event.startTime, event.endTime)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The event goes back to the state automation had before it was marked. If a text went
                out when it was marked, a short correction text goes out now.
              </p>
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  reopenPreview?.outlook === 'no-automatic-action'
                    ? 'border-border bg-muted/30 text-foreground'
                    : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100'
                }`}
              >
                {isLoadingContext || !reopenPreview
                  ? 'Checking what the worker will do…'
                  : reopenPreview.outlook === 'no-automatic-action'
                    ? reopenPreview.message
                    : `Reopening lets the worker try to grant access to this event. ${reopenPreview.message}`}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onCloseAction} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={submitReopen} disabled={isSaving || isLoadingContext}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Reopen for automation
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
