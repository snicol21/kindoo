import type { Ward } from '@/schema/schema';

const phoneDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

type MatchableContact = {
  id: string;
  name: string;
  ward: Ward;
  email: string | null;
  phone: string | null;
};

type ContactMatchInput = {
  name: string;
  ward: Ward | '';
  email: string;
  phone: string;
};

type SuggestionOptions = {
  limit?: number;
};

function scoreContact(contact: MatchableContact, input: ContactMatchInput): number {
  const normalizedName = input.name.trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = phoneDigits(input.phone);

  const contactName = contact.name.trim().toLowerCase();
  const contactEmail = (contact.email ?? '').trim().toLowerCase();
  const contactPhone = phoneDigits(contact.phone);

  let score = 0;

  if (normalizedEmail) {
    if (contactEmail === normalizedEmail) score += 1200;
    else if (contactEmail.startsWith(normalizedEmail)) score += 850;
    else if (contactEmail.includes(normalizedEmail)) score += 650;
  }

  if (normalizedPhone) {
    if (contactPhone === normalizedPhone) score += 1150;
    else if (contactPhone.startsWith(normalizedPhone)) score += 800;
    else if (contactPhone.endsWith(normalizedPhone)) score += 760;
    else if (contactPhone.includes(normalizedPhone)) score += 620;
  }

  if (normalizedName.length >= 2) {
    if (contactName === normalizedName) score += 1100;
    else if (contactName.startsWith(normalizedName)) score += 900;
    else if (contactName.includes(normalizedName)) score += 700;

    const tokenPrefixMatch = contactName
      .split(/\s+/)
      .some((token) => token.startsWith(normalizedName));
    if (tokenPrefixMatch) score += 180;
  }

  if (input.ward && contact.ward === input.ward) {
    score += 80;
  }

  return score;
}

export function findExactContact<T extends MatchableContact>(
  contacts: T[],
  input: ContactMatchInput
): T | null {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = phoneDigits(input.phone);
  const normalizedName = input.name.trim().toLowerCase();

  const wardFiltered = input.ward
    ? contacts.filter((contact) => contact.ward === input.ward)
    : contacts;

  if (normalizedEmail) {
    const emailMatch = wardFiltered.find(
      (contact) => (contact.email ?? '').trim().toLowerCase() === normalizedEmail
    );
    if (emailMatch) return emailMatch;
  }

  if (normalizedPhone) {
    const phoneMatch = wardFiltered.find(
      (contact) => phoneDigits(contact.phone) === normalizedPhone
    );
    if (phoneMatch) return phoneMatch;
  }

  if (normalizedName && input.ward) {
    const nameMatch = wardFiltered.find(
      (contact) => contact.name.trim().toLowerCase() === normalizedName
    );
    if (nameMatch) return nameMatch;
  }

  return null;
}

export function getContactSuggestions<T extends MatchableContact>(
  contacts: T[],
  input: ContactMatchInput,
  options: SuggestionOptions = {}
): T[] {
  const normalizedName = input.name.trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedPhone = phoneDigits(input.phone);

  if (!normalizedName && !normalizedEmail && !normalizedPhone) return [];

  const wardFiltered = input.ward
    ? contacts.filter((contact) => contact.ward === input.ward)
    : contacts;

  const ranked = wardFiltered
    .map((contact) => ({ contact, score: scoreContact(contact, input) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.contact.name.localeCompare(b.contact.name);
    })
    .map((entry) => entry.contact);

  const limit = Math.max(1, options.limit ?? 8);
  return ranked.slice(0, limit);
}
