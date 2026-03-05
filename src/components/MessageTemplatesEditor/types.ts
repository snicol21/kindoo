import type { MessageTemplateKey, MessageTemplateMap } from '@/lib/message-templates';

export interface MessageTemplatesEditorProps {
  initialTemplates: MessageTemplateMap;
}

export interface TemplateDraft {
  key: MessageTemplateKey;
  body: string;
}

export type PlaceholderSelectionMap = Record<MessageTemplateKey, string>;

export type TextareaRefMap = Record<MessageTemplateKey, HTMLTextAreaElement | null>;

export type OverlayRefMap = Record<MessageTemplateKey, HTMLDivElement | null>;
