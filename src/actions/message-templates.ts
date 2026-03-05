'use server';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { messageTemplateDefaults, messageTemplates } from '@/schema/schema';
import { eq, sql } from 'drizzle-orm';
import {
  EMPTY_MESSAGE_TEMPLATES,
  MESSAGE_TEMPLATE_KEYS,
  type MessageTemplateKey,
  type MessageTemplateMap,
} from '@/lib/message-templates';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const MAX_TEMPLATE_LENGTH = 2000;

function normalizeBody(body: string) {
  return body.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
}

function validateTemplateBody(key: MessageTemplateKey, body: string) {
  if (!MESSAGE_TEMPLATE_KEYS.includes(key)) {
    return 'Unknown template key provided.';
  }
  if (!body.trim()) {
    return 'Template text cannot be empty.';
  }
  if (body.length > MAX_TEMPLATE_LENGTH) {
    return `Template text must be ${MAX_TEMPLATE_LENGTH} characters or less.`;
  }
  return null;
}

export async function getMessageTemplates(): Promise<ActionResult<MessageTemplateMap>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const defaults = await db
      .select({ key: messageTemplateDefaults.key, body: messageTemplateDefaults.body })
      .from(messageTemplateDefaults);

    const defaultMap = defaults.reduce(
      (acc, row) => {
        if (MESSAGE_TEMPLATE_KEYS.includes(row.key as MessageTemplateKey)) {
          acc[row.key as MessageTemplateKey] = row.body;
        }
        return acc;
      },
      { ...EMPTY_MESSAGE_TEMPLATES } as MessageTemplateMap
    );

    const rows = await db
      .select({ key: messageTemplates.key, body: messageTemplates.body })
      .from(messageTemplates)
      .where(eq(messageTemplates.userId, session.user.id));

    const merged: MessageTemplateMap = { ...defaultMap };
    for (const row of rows) {
      if (MESSAGE_TEMPLATE_KEYS.includes(row.key as MessageTemplateKey)) {
        merged[row.key as MessageTemplateKey] =
          row.body ?? defaultMap[row.key as MessageTemplateKey] ?? '';
      }
    }
    return { success: true, data: merged };
  } catch (error) {
    console.error('[getMessageTemplates] Error:', error);
    return { success: false, error: 'Failed to load message templates.' };
  }
}

export async function updateMessageTemplate(input: {
  key: MessageTemplateKey;
  body: string;
}): Promise<ActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const body = normalizeBody(String(input.body ?? ''));
    const validationError = validateTemplateBody(input.key, body);
    if (validationError) {
      return { success: false, error: validationError };
    }

    await db
      .insert(messageTemplates)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        key: input.key,
        body,
      })
      .onConflictDoUpdate({
        target: [messageTemplates.userId, messageTemplates.key],
        set: {
          body,
          updatedAt: sql`(unixepoch())`,
        },
      });

    return { success: true };
  } catch (error) {
    console.error('[updateMessageTemplate] Error:', error);
    return { success: false, error: 'Failed to update message template.' };
  }
}

export async function updateMessageTemplates(input: {
  templates: { key: MessageTemplateKey; body: string }[];
}): Promise<ActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: 'Not authenticated.' };
    }

    const templateMap = new Map<MessageTemplateKey, string>();

    for (const template of input.templates) {
      const body = normalizeBody(String(template.body ?? ''));
      const validationError = validateTemplateBody(template.key, body);
      if (validationError) {
        return { success: false, error: validationError };
      }
      templateMap.set(template.key, body);
    }

    for (const key of MESSAGE_TEMPLATE_KEYS) {
      if (!templateMap.has(key)) {
        return { success: false, error: 'All templates must be provided.' };
      }
    }

    const rows = Array.from(templateMap.entries()).map(([key, body]) => ({
      id: crypto.randomUUID(),
      userId: session.user.id,
      key,
      body,
    }));

    await db.transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .insert(messageTemplates)
          .values(row)
          .onConflictDoUpdate({
            target: [messageTemplates.userId, messageTemplates.key],
            set: {
              body: row.body,
              updatedAt: sql`(unixepoch())`,
            },
          });
      }
    });

    return { success: true };
  } catch (error) {
    console.error('[updateMessageTemplates] Error:', error);
    return { success: false, error: 'Failed to update message templates.' };
  }
}
