'use client';

import { Badge } from '@/components/_ui/badge';
import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { Label } from '@/components/_ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import { Textarea } from '@/components/_ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/_ui/tooltip';
import {
  PLACEHOLDER_EXAMPLES,
  PLACEHOLDER_LOOKUP,
  TEMPLATE_TEXTAREA_ROWS,
  TOKEN_HIGHLIGHT_CLASS,
} from '@/components/MessageTemplatesEditor/constants';
import { renderPreviewText } from '@/components/MessageTemplatesEditor/utils';
import { TEMPLATE_PLACEHOLDERS, type MessageTemplateDefinition } from '@/lib/message-templates';

type TemplateCardProps = {
  template: MessageTemplateDefinition;
  draftBody: string;
  usedPlaceholders: string[];
  placeholderSelection: string;
  saving: boolean;
  hasChanges: boolean;
  onBodyChangeAction: (value: string) => void;
  onInsertPlaceholderAction: (value: string) => void;
  onResetAction: () => void;
  onSaveAction: () => void;
  onTextareaRefAction: (node: HTMLTextAreaElement | null) => void;
  onOverlayRefAction: (node: HTMLDivElement | null) => void;
};

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

export function TemplateCard({
  template,
  draftBody,
  usedPlaceholders,
  placeholderSelection,
  saving,
  hasChanges,
  onBodyChangeAction,
  onInsertPlaceholderAction,
  onResetAction,
  onSaveAction,
  onTextareaRefAction,
  onOverlayRefAction,
}: TemplateCardProps) {
  return (
    <Card>
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
              className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2 text-[16px] leading-6 sm:text-sm sm:leading-5"
              ref={onOverlayRefAction}
            >
              {renderHighlightedTemplate(draftBody)}
            </div>
            <Textarea
              id={`template-${template.key}`}
              rows={TEMPLATE_TEXTAREA_ROWS[template.key]}
              value={draftBody}
              onChange={(event) => onBodyChangeAction(event.target.value)}
              className="relative z-10 resize-none overflow-hidden text-[16px] leading-6 text-transparent caret-[color:var(--color-foreground)] sm:text-sm sm:leading-5"
              spellCheck={false}
              ref={onTextareaRefAction}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-2">
            <Label>Insert placeholder</Label>
            <Select value={placeholderSelection} onValueChange={onInsertPlaceholderAction}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a placeholder" />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                  <SelectItem key={placeholder.token} value={placeholder.token}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={TOKEN_HIGHLIGHT_CLASS}>{placeholder.token}</span>
                      <span className="text-muted-foreground">{placeholder.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onResetAction}>
              Reset changes
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving || !hasChanges}
              isLoading={saving}
              loadingText="Saving..."
              onClick={onSaveAction}
            >
              Save template
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
            <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary/60" />
            <div className="max-w-2xl rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm">
              <div className="text-foreground/90">{renderPreviewText(draftBody)}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Sample values shown for placeholders.</p>
        </div>
      </CardContent>
    </Card>
  );
}
