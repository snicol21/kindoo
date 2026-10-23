import { OTHER_WARD, OTHER_WARD_NAME_MAX_LENGTH, WARDS, type Ward } from '@/schema/schema';

// Letters (incl. accented), digits, spaces, and a few punctuation marks common in unit names.
const OTHER_WARD_NAME_PATTERN = /^[\p{L}\p{N} .,'&()#/-]+$/u;

export function isOtherWard(ward: unknown): ward is typeof OTHER_WARD {
  return ward === OTHER_WARD;
}

export function isWard(value: unknown): value is Ward {
  return typeof value === 'string' && (WARDS as readonly string[]).includes(value);
}

/** Trim and collapse whitespace. Returns '' for nullish input. */
export function cleanOtherWardName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Returns an error message, or null when valid. Only meaningful when ward is "Other". */
export function validateOtherWardName(value: unknown): string | null {
  const cleaned = cleanOtherWardName(value);
  if (!cleaned) return 'Please enter the ward or unit name.';
  if (cleaned.length < 2) return 'Ward or unit name must be at least 2 characters.';
  if (cleaned.length > OTHER_WARD_NAME_MAX_LENGTH) {
    return `Ward or unit name must be ${OTHER_WARD_NAME_MAX_LENGTH} characters or less.`;
  }
  if (!OTHER_WARD_NAME_PATTERN.test(cleaned)) {
    return "Ward or unit name can only use letters, numbers, spaces, and . , ' & ( ) # / -";
  }
  return null;
}

/** Value to store in contact.other_ward_name: cleaned text for "Other", otherwise null. */
export function normalizeOtherWardNameForStorage(ward: Ward, value: unknown): string | null {
  return isOtherWard(ward) ? cleanOtherWardName(value) || null : null;
}

/** Human label for a ward, e.g. "Other: Riverton 3rd Ward". */
export function formatWardLabel(ward: Ward | string, otherWardName?: string | null): string {
  if (isOtherWard(ward)) {
    const name = cleanOtherWardName(otherWardName);
    return name ? `Other: ${name}` : 'Other';
  }
  return ward;
}
