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
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import { Textarea } from '@/components/_ui/textarea';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

type EventMessagesDialogProps = {
  copyingEvent: EventWithCreator | null;
  messageTemplates?: MessageTemplateMap;
  onCloseAction: () => void;
  formatPhoneAction: (value?: string | null) => string;
  renderMessageTemplateAction: (
    event: EventWithCreator,
    key: 'availability_inquiry' | 'calendar_item' | 'availability_confirmed' | 'license_created',
    templates?: MessageTemplateMap
  ) => string;
};

export function EventMessagesDialog({
  copyingEvent,
  messageTemplates,
  onCloseAction,
  formatPhoneAction,
  renderMessageTemplateAction,
}: EventMessagesDialogProps) {
  return (
    <Dialog open={!!copyingEvent} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent className="sm:max-w-3xl" onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Event messages</DialogTitle>
          <DialogDescription>Copy a formatted message to share.</DialogDescription>
        </DialogHeader>
        {copyingEvent && (
          <div className="space-y-4">
            {(copyingEvent.contactEmail?.trim() || copyingEvent.contactPhone?.trim()) && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {copyingEvent.contactEmail?.trim() && (
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <div className="flex w-full items-center gap-2">
                      <Input
                        readOnly
                        value={copyingEvent.contactEmail}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        className="shrink-0 sm:mr-3"
                        aria-label="Copy email"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(copyingEvent.contactEmail ?? '');
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
                {copyingEvent.contactPhone?.trim() && (
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <div className="flex w-full items-center gap-2">
                      <Input
                        readOnly
                        value={formatPhoneAction(copyingEvent.contactPhone)}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        variant="secondary"
                        size="icon"
                        className="shrink-0 sm:mr-3"
                        aria-label="Copy phone"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              formatPhoneAction(copyingEvent.contactPhone)
                            );
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
                  className="min-w-0 flex-1 min-h-35"
                  value={renderMessageTemplateAction(
                    copyingEvent,
                    'availability_inquiry',
                    messageTemplates
                  )}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        renderMessageTemplateAction(
                          copyingEvent,
                          'availability_inquiry',
                          messageTemplates
                        )
                      );
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
                  className="min-w-0 flex-1 min-h-35"
                  value={renderMessageTemplateAction(
                    copyingEvent,
                    'calendar_item',
                    messageTemplates
                  )}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        renderMessageTemplateAction(copyingEvent, 'calendar_item', messageTemplates)
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
                value={renderMessageTemplateAction(
                  copyingEvent,
                  'availability_confirmed',
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
                        copyingEvent,
                        'availability_confirmed',
                        messageTemplates
                      )
                    );
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
          <Button variant="outline" onClick={onCloseAction}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
