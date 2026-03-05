import { useMemo } from 'react';
import type {
  ContactChangeOptions,
  ContactChangeState,
  ContactFormValues,
  LinkedContactSnapshot,
} from '@/lib/contact-linking';
import { getContactChangeState } from '@/lib/contact-linking';

export function useContactChangeState(
  linked: LinkedContactSnapshot | null,
  form: ContactFormValues,
  options?: ContactChangeOptions
): ContactChangeState {
  return useMemo(
    () => getContactChangeState(linked, form, options),
    [
      linked?.name,
      linked?.ward,
      linked?.email,
      linked?.phone,
      form.name,
      form.ward,
      form.email,
      form.phone,
      options?.treatEmailPhoneChangeAsUnlink,
    ]
  );
}
