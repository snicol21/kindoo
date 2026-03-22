import 'server-only';

import twilio from 'twilio';

export interface SendSmsInput {
  to: string;
  body: string;
}

export async function sendSms(
  input: SendSmsInput
): Promise<{ ok: true; providerMessageId: string | null } | { ok: false; error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!accountSid || !authToken || !fromNumber) {
    return {
      ok: false,
      error:
        'SMS provider is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.',
    };
  }

  try {
    const client = twilio(accountSid, authToken);
    const response = await client.messages.create({
      body: input.body,
      from: fromNumber,
      to: input.to,
    });

    return { ok: true, providerMessageId: response.sid ?? null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown SMS error.',
    };
  }
}

export function normalizePhoneToE164(value?: string | null): string | null {
  if (!value) return null;

  const raw = value.trim();
  if (!raw) return null;

  if (/^\+[1-9]\d{7,14}$/.test(raw)) {
    return raw;
  }

  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
}
