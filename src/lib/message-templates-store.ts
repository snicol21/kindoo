import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  EMPTY_MESSAGE_TEMPLATES,
  MESSAGE_TEMPLATE_KEYS,
  type MessageTemplateKey,
  type MessageTemplateMap,
} from '@/lib/message-templates';
import { messageTemplateDefaults, messageTemplates } from '@/schema/schema';

export async function loadMessageTemplatesForUser(userId: string): Promise<MessageTemplateMap> {
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
    .where(eq(messageTemplates.userId, userId));

  const merged: MessageTemplateMap = { ...defaultMap };
  for (const row of rows) {
    if (MESSAGE_TEMPLATE_KEYS.includes(row.key as MessageTemplateKey)) {
      merged[row.key as MessageTemplateKey] =
        row.body ?? defaultMap[row.key as MessageTemplateKey] ?? '';
    }
  }

  return merged;
}
