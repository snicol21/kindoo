'use client';

import { useEffect, useRef, useState } from 'react';
import { TooltipProvider } from '@/components/_ui/tooltip';
import { toast } from 'sonner';
import { updateMessageTemplate } from '@/actions/message-templates';
import { MESSAGE_TEMPLATE_DEFINITIONS, type MessageTemplateKey } from '@/lib/message-templates';
import { EMPTY_PLACEHOLDER_SELECTION } from '@/components/MessageTemplatesEditor/constants';
import { TemplateCard } from '@/components/MessageTemplatesEditor/TemplateCard';
import type {
  MessageTemplatesEditorProps,
  OverlayRefMap,
  PlaceholderSelectionMap,
  TemplateDraft,
  TextareaRefMap,
} from '@/components/MessageTemplatesEditor/types';
import {
  getUsedPlaceholders,
  insertTokenAtCursor,
} from '@/components/MessageTemplatesEditor/utils';

export function MessageTemplatesEditor({ initialTemplates }: MessageTemplatesEditorProps) {
  const [savedTemplates, setSavedTemplates] = useState(initialTemplates);
  const [savingKey, setSavingKey] = useState<MessageTemplateKey | null>(null);
  const [placeholderSelection, setPlaceholderSelection] = useState<PlaceholderSelectionMap>(
    EMPTY_PLACEHOLDER_SELECTION
  );

  const [drafts, setDrafts] = useState<TemplateDraft[]>(() =>
    MESSAGE_TEMPLATE_DEFINITIONS.map((template) => ({
      key: template.key,
      body: initialTemplates[template.key] ?? '',
    }))
  );

  const textareaRefs = useRef<TextareaRefMap>({
    availability_inquiry: null,
    calendar_item: null,
    availability_confirmed: null,
    license_created: null,
  });
  const overlayRefs = useRef<OverlayRefMap>({
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
    const nextHeight = textarea.scrollHeight;
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
            <TemplateCard
              key={template.key}
              template={template}
              draftBody={draftBody}
              usedPlaceholders={usedPlaceholders}
              placeholderSelection={placeholderSelection[template.key]}
              saving={saving}
              hasChanges={hasChanges}
              onBodyChangeAction={(value) => handleBodyChange(template.key, value)}
              onInsertPlaceholderAction={(value) => insertPlaceholder(template.key, value)}
              onResetAction={() => resetTemplate(template.key)}
              onSaveAction={() => handleSaveTemplate(template.key)}
              onTextareaRefAction={(node) => {
                textareaRefs.current[template.key] = node;
              }}
              onOverlayRefAction={(node) => {
                overlayRefs.current[template.key] = node;
              }}
            />
          );
        })}
      </div>
    </TooltipProvider>
  );
}
