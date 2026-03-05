'use client';

import type { EventWithCreator } from '@/actions/events';
import type { MessageTemplateMap } from '@/lib/message-templates';
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
import { Copy, ExternalLink } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';

type KindooLicenseDialogProps = {
  licenseEvent: EventWithCreator | null;
  messageTemplates?: MessageTemplateMap;
  onCloseAction: () => void;
  onToggleLicenseCreatedAction?: (input: {
    eventId: string;
    kindooLicenseCreated: boolean;
  }) => Promise<void>;
  submitKindooLicenseStatusAction: (event: EventWithCreator, nextValue: boolean) => Promise<void>;
  getLicenseTimesAction: (event: EventWithCreator) => {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
  } | null;
  formatDateAction: (dateStr: string) => string;
  formatTimeRangeAction: (startTime: string, endTime: string) => string;
  renderMessageTemplateAction: (
    event: EventWithCreator,
    key: 'availability_inquiry' | 'calendar_item' | 'availability_confirmed' | 'license_created',
    templates?: MessageTemplateMap
  ) => string;
};

export function KindooLicenseDialog({
  licenseEvent,
  messageTemplates,
  onCloseAction,
  onToggleLicenseCreatedAction,
  submitKindooLicenseStatusAction,
  getLicenseTimesAction,
  formatDateAction,
  formatTimeRangeAction,
  renderMessageTemplateAction,
}: KindooLicenseDialogProps) {
  const licenseDialogContentRef = useRef<HTMLDivElement | null>(null);

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
          <DialogDescription>Copy these values into the Kindoo setup form.</DialogDescription>
        </DialogHeader>
        {licenseEvent && (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p className="font-medium text-foreground">License timing reference</p>
              <p className="text-muted-foreground">
                Event: {formatDateAction(licenseEvent.eventDate)} ·{' '}
                {formatTimeRangeAction(licenseEvent.startTime, licenseEvent.endTime)}
              </p>
              <p className="text-muted-foreground">
                Generated values use 2 hours before event start and 2 hours after event end, capped
                to the allowed 5:00 AM–11:00 PM window.
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
              const licenseTimes = getLicenseTimesAction(licenseEvent);
              if (!licenseTimes) return null;
              return (
                <>
                  <div className="space-y-2">
                    <Label>Rights activated starting</Label>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input readOnly value={licenseTimes.startDate} className="min-w-0 flex-1" />
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
                        <Input readOnly value={licenseTimes.startTime} className="min-w-0 flex-1" />
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
                  disabled={!onToggleLicenseCreatedAction}
                  onChange={(e) => {
                    void submitKindooLicenseStatusAction(licenseEvent, e.target.checked);
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
                  value={renderMessageTemplateAction(
                    licenseEvent,
                    'license_created',
                    messageTemplates
                  )}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        renderMessageTemplateAction(
                          licenseEvent,
                          'license_created',
                          messageTemplates
                        )
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
          <Button variant="outline" onClick={onCloseAction}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
