export function formatPhone(value?: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length > 10) {
    normalized = normalized.slice(0, 10);
  }

  if (normalized.length <= 3) return normalized;
  if (normalized.length <= 6) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3)}`;
  }
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

export function normalizePhoneForStorage(value?: string) {
  if (!value) return undefined;
  const formatted = formatPhone(value);
  return formatted ? formatted : undefined;
}
