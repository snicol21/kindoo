import type { Ward } from '@/schema/schema';

const phoneDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

export type LinkedContactSnapshot = {
  name: string;
  ward: Ward;
  email: string | null;
  phone: string | null;
};

export type ContactFormValues = {
  name: string;
  ward: Ward | '';
  email: string;
  phone: string;
};

export type ContactChangeState = {
  changed: {
    name: boolean;
    ward: boolean;
    email: boolean;
    phone: boolean;
  };
  hasEdits: boolean;
  willCreateNewContact: boolean;
  showLinkedState: boolean;
  changeSummary: string | null;
  identifierGuidance: string | null;
};

export type ContactChangeOptions = {
  treatEmailPhoneChangeAsUnlink?: boolean;
};

export function getContactChangeState(
  linked: LinkedContactSnapshot | null,
  form: ContactFormValues,
  options: ContactChangeOptions = {}
): ContactChangeState {
  const normalizedName = form.name.trim();
  const normalizedEmail = form.email.trim().toLowerCase();
  const normalizedPhone = phoneDigits(form.phone);

  const changed = {
    name: !!linked && linked.name.trim() !== normalizedName,
    ward: !!linked && linked.ward !== form.ward,
    email: !!linked && (linked.email ?? '').trim().toLowerCase() !== normalizedEmail,
    phone: !!linked && phoneDigits(linked.phone) !== normalizedPhone,
  };

  const hasEdits = Object.values(changed).some(Boolean);
  const allowUnlink = options.treatEmailPhoneChangeAsUnlink !== false;
  const willCreateNewContact = allowUnlink && changed.email && changed.phone;
  const showLinkedState = !!linked && !willCreateNewContact;

  const changedLabels = [
    changed.name ? 'name' : null,
    changed.phone ? 'phone' : null,
    changed.email ? 'email' : null,
    changed.ward ? 'ward' : null,
  ].filter(Boolean) as string[];

  const changeSummary = changedLabels.length ? `Updating ${changedLabels.join(', ')}.` : null;

  let identifierGuidance: string | null = null;
  if (hasEdits) {
    if (!changed.phone && !changed.email) {
      identifierGuidance =
        'Email and phone are unchanged, so this event stays linked to this contact.';
    } else if (changed.phone && !changed.email) {
      identifierGuidance =
        'This updates the linked contact. To create a new contact instead, change the email too.';
    } else if (changed.email && !changed.phone) {
      identifierGuidance =
        'This updates the linked contact. To create a new contact instead, change the phone too.';
    } else if (willCreateNewContact) {
      identifierGuidance = 'Email and phone are both changing, so this will create a new contact.';
    } else {
      identifierGuidance =
        'Email and phone are both changing, and this will update the linked contact.';
    }
  }

  return {
    changed,
    hasEdits,
    willCreateNewContact,
    showLinkedState,
    changeSummary,
    identifierGuidance,
  };
}
