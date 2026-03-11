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

type MessageBubbleSectionProps = {
  label: string;
  message: string;
  onCopyAction: () => Promise<void>;
};

function MessageBubbleSection({ label, message, onCopyAction }: MessageBubbleSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary/60" />
        <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm">
          <div className="text-foreground/90">{message}</div>
        </div>
      </div>
      <Button variant="secondary" size="sm" className="ml-[22px] self-start" onClick={onCopyAction}>
        <Copy className="mr-2 h-4 w-4" />
        Copy Message
      </Button>
    </div>
  );
}

export function EventMessagesDialog({
  copyingEvent,
  messageTemplates,
  onCloseAction,
  formatPhoneAction,
  renderMessageTemplateAction,
}: EventMessagesDialogProps) {
  return (
    <Dialog open={!!copyingEvent} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent
        className="flex flex-col overflow-hidden sm:max-w-3xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Event messages</DialogTitle>
          <DialogDescription>Copy a formatted message to share.</DialogDescription>
        </DialogHeader>
        {copyingEvent && (
          <div className="min-h-0 flex-1 space-y-8 overflow-x-hidden overflow-y-auto pr-1 py-2">
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
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
                <MessageBubbleSection
                  label="Availability inquiry text"
                  message={renderMessageTemplateAction(
                    copyingEvent,
                    'availability_inquiry',
                    messageTemplates
                  )}
                  onCopyAction={async () => {
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
                />
                <MessageBubbleSection
                  label="Calendar item description"
                  message={renderMessageTemplateAction(
                    copyingEvent,
                    'calendar_item',
                    messageTemplates
                  )}
                  onCopyAction={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        renderMessageTemplateAction(copyingEvent, 'calendar_item', messageTemplates)
                      );
                      toast.success('Calendar item description copied.');
                    } catch {
                      toast.error('Failed to copy.');
                    }
                  }}
                />
              </div>
              <MessageBubbleSection
                label="Availability confirmed + policy text"
                message={renderMessageTemplateAction(
                  copyingEvent,
                  'availability_confirmed',
                  messageTemplates
                )}
                onCopyAction={async () => {
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
              />
              <MessageBubbleSection
                label="License created message"
                message={renderMessageTemplateAction(copyingEvent, 'license_created', messageTemplates)}
                onCopyAction={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      renderMessageTemplateAction(copyingEvent, 'license_created', messageTemplates)
                    );
                    toast.success('License created message copied.');
                  } catch {
                    toast.error('Failed to copy.');
                  }
                }}
              />
          </div>
        )}
        <DialogFooter className="border-t bg-background pt-3">
          <Button variant="outline" onClick={onCloseAction}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
