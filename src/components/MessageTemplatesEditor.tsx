'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { updateMessageTemplate } from '@/actions/message-templates';
import {
  MESSAGE_TEMPLATE_DEFINITIONS,
  TEMPLATE_PLACEHOLDERS,
  type MessageTemplateKey,
  type MessageTemplateMap,
} from '@/lib/message-templates';

interface MessageTemplatesEditorProps {
  initialTemplates: MessageTemplateMap;
}

interface TemplateDraft {
  key: MessageTemplateKey;
  body: string;
}

const PLACEHOLDER_LOOKUP = TEMPLATE_PLACEHOLDERS.reduce(
  (acc, placeholder) => {
    acc[placeholder.token] = placeholder;
    return acc;
  },
  {} as Record<string, (typeof TEMPLATE_PLACEHOLDERS)[number]>
);

const TOKEN_HIGHLIGHT_CLASS =
  'rounded-sm bg-emerald-100/70 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100';

const PLACEHOLDER_EXAMPLES: Record<string, string> = {
  '{firstName}': 'Alex',
  '{fullName}': 'Alex Johnson',
  '{building}': 'Stake Center',
  '{ward}': '2nd Ward',
  '{eventDate}': 'Mar 18',
  '{eventDateLong}': 'Mar 18, 2026',
  '{startTime}': '6:00 PM',
  '{endTime}': '8:00 PM',
  '{timeRange}': '6:00 PM – 8:00 PM',
  '{description}': 'Wedding reception',
  '{email}': 'alex@example.com',
  '{phone}': '(555) 123-4567',
  '{policyLink}': 'https://drive.google.com/…',
  '{licenseStartDate}': '03/18/2026',
  '{licenseStartTime}': '4:00 PM',
  '{licenseEndDate}': '03/18/2026',
  '{licenseEndTime}': '10:00 PM',
  '{licenseWindow}': '03/18/2026 (4:00 PM – 10:00 PM)',
};

function insertTokenAtCursor(value: string, token: string, start: number, end: number) {
  const prefix = value.slice(0, start);
  const suffix = value.slice(end);
  return `${prefix}${token}${suffix}`;
}

function renderHighlightedTemplate(body: string) {
  const parts = body.split(/(\{[a-zA-Z0-9_]+\})/g);
  return parts.map((part, index) => {
    if (PLACEHOLDER_LOOKUP[part]) {
      return (
        <span key={`${part}-${index}`} className={TOKEN_HIGHLIGHT_CLASS}>
          {part}
        </span>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function renderPreviewText(body: string) {
  return body.replace(/\{[a-zA-Z0-9_]+\}/g, (token) => PLACEHOLDER_EXAMPLES[token] ?? token);
}

export function MessageTemplatesEditor({ initialTemplates }: MessageTemplatesEditorProps) {
  const [savedTemplates, setSavedTemplates] = useState<MessageTemplateMap>(initialTemplates);
  const [savingKey, setSavingKey] = useState<MessageTemplateKey | null>(null);
  const [placeholderSelection, setPlaceholderSelection] = useState<
    Record<MessageTemplateKey, string>
  >({
    availability_inquiry: '',
    calendar_item: '',
    availability_confirmed: '',
    license_created: '',
  });

  const [drafts, setDrafts] = useState<TemplateDraft[]>(() =>
    MESSAGE_TEMPLATE_DEFINITIONS.map((template) => ({
      key: template.key,
      body: initialTemplates[template.key] ?? '',
    }))
  );

  const textareaRefs = useRef<Record<MessageTemplateKey, HTMLTextAreaElement | null>>({
    availability_inquiry: null,
    calendar_item: null,
    availability_confirmed: null,
    license_created: null,
  });
  const overlayRefs = useRef<Record<MessageTemplateKey, HTMLDivElement | null>>({
    availability_inquiry: null,
    calendar_item: null,
    availability_confirmed: null,
    license_created: null,
  });

  const handleBodyChange = (key: MessageTemplateKey, body: string) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, body } : draft)));
    requestAnimationFrame(() => {
      resizeTextarea(key);
    });
  };

  const resizeTextarea = (key: MessageTemplateKey) => {
    const textarea = textareaRefs.current[key];
    const overlay = overlayRefs.current[key];
    if (!textarea || !overlay) return;
    textarea.style.height = 'auto';
    const nextHeight = Math.max(textarea.scrollHeight, 120);
    textarea.style.height = `${nextHeight}px`;
    overlay.style.height = `${nextHeight}px`;
  };

  const insertTokenForKey = (key: MessageTemplateKey, token: string) => {
    const target = textareaRefs.current[key];

    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.key !== key) return draft;

        const body = draft.body ?? '';
        if (!target) {
          const spacer = body && !body.endsWith(' ') ? ' ' : '';
          return { ...draft, body: `${body}${spacer}${token}` };
        }

        const start = target.selectionStart ?? body.length;
        const end = target.selectionEnd ?? body.length;
        const next = insertTokenAtCursor(body, token, start, end);

        requestAnimationFrame(() => {
          target.focus();
          const cursor = start + token.length;
          target.setSelectionRange(cursor, cursor);
        });

        return { ...draft, body: next };
      })
    );
  };

  const updatePlaceholderSelection = (key: MessageTemplateKey, value: string) => {
    setPlaceholderSelection((prev) => ({ ...prev, [key]: value }));
  };

  const insertPlaceholder = (key: MessageTemplateKey, token: string) => {
    if (!token) return;
    insertTokenForKey(key, token);
    updatePlaceholderSelection(key, '');
  };

  const resetTemplate = (key: MessageTemplateKey) => {
    const fallback = savedTemplates[key] ?? '';
    setDrafts((prev) =>
      prev.map((draft) => (draft.key === key ? { ...draft, body: fallback } : draft))
    );
  };

  const isDirtyForKey = (key: MessageTemplateKey) => {
    const draft = drafts.find((item) => item.key === key);
    const initial = savedTemplates[key] ?? '';
    return (draft?.body ?? initial) !== initial;
  };

  const handleSaveTemplate = async (key: MessageTemplateKey) => {
    const draft = drafts.find((item) => item.key === key);
    if (!draft) return;

    setSavingKey(key);
    const result = await updateMessageTemplate({ key, body: draft.body });
    if (!result.success) {
      toast.error(result.error ?? 'Failed to update message template.');
      setSavingKey(null);
      return;
    }

    setSavedTemplates((prev) => ({ ...prev, [key]: draft.body }));
    setSavingKey(null);
    toast.success('Template updated.');
  };

  const getUsedPlaceholders = (body: string) => {
    const matches = body.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
    const unique = Array.from(new Set(matches));
    return unique.filter((token) => PLACEHOLDER_LOOKUP[token]);
  };

  useEffect(() => {
    for (const template of MESSAGE_TEMPLATE_DEFINITIONS) {
      resizeTextarea(template.key);
    }
  }, [drafts]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {MESSAGE_TEMPLATE_DEFINITIONS.map((template) => {
          const draft = drafts.find((item) => item.key === template.key);
          const draftBody = draft?.body ?? '';
          const usedPlaceholders = getUsedPlaceholders(draftBody);
          const saving = savingKey === template.key;
          const hasChanges = isDirtyForKey(template.key);

          return (
            <Card key={template.key}>
              <CardHeader>
                <CardTitle>{template.title}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor={`template-${template.key}`}>Template text</Label>
                  <div className="relative">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-sm"
                      ref={(node) => {
                        overlayRefs.current[template.key] = node;
                      }}
                    >
                      {renderHighlightedTemplate(draftBody)}
                    </div>
                    <Textarea
                      id={`template-${template.key}`}
                      rows={template.key === 'availability_confirmed' ? 10 : 6}
                      value={draftBody}
                      onChange={(event) => handleBodyChange(template.key, event.target.value)}
                      className="relative z-10 resize-none overflow-hidden text-transparent caret-[color:var(--color-foreground)]"
                      spellCheck={false}
                      ref={(node) => {
                        textareaRefs.current[template.key] = node;
                      }}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label>Insert placeholder</Label>
                    <Select
                      value={placeholderSelection[template.key]}
                      onValueChange={(value) => insertPlaceholder(template.key, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a placeholder" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                          <SelectItem key={placeholder.token} value={placeholder.token}>
                            <span className="flex flex-wrap items-center gap-2">
                              <span className={TOKEN_HIGHLIGHT_CLASS}>{placeholder.token}</span>
                              <span className="text-muted-foreground">
                                {placeholder.description}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => resetTemplate(template.key)}
                    >
                      Reset changes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving || !hasChanges}
                      onClick={() => handleSaveTemplate(template.key)}
                    >
                      {saving ? 'Saving...' : 'Save template'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Placeholders used in this template</Label>
                  {usedPlaceholders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No placeholders used yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {usedPlaceholders.map((token) => {
                        const placeholder = PLACEHOLDER_LOOKUP[token];
                        const example = PLACEHOLDER_EXAMPLES[token] ?? '—';
                        return (
                          <Tooltip key={token}>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className="border border-primary/20 bg-primary/10 text-primary"
                              >
                                {token}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="space-y-1">
                                <p className="font-medium text-foreground">{token}</p>
                                <p className="text-muted-foreground">
                                  {placeholder?.description ?? 'Placeholder'}
                                </p>
                                <p className="text-muted-foreground">
                                  Example: <span className="text-foreground">{example}</span>
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Preview</Label>
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-primary/60" />
                    <div className="max-w-2xl rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm">
                      <div className="text-foreground/90">{renderPreviewText(draftBody)}</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sample values shown for placeholders.
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
