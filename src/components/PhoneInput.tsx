'use client';

import { Input } from '@/components/_ui/input';
import { formatPhone } from '@/utils/phoneUtils';

type PhoneInputProps = {
  id?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  onValueChange?: (value: string) => void;
};

export function PhoneInput({
  id,
  name,
  defaultValue,
  value,
  placeholder = '(555) 000-0000',
  required,
  onValueChange,
}: PhoneInputProps) {
  return (
    <Input
      id={id}
      name={name}
      type="tel"
      placeholder={placeholder}
      defaultValue={defaultValue}
      value={value}
      required={required}
      onChange={(event) => {
        const formatted = formatPhone(event.target.value);
        event.target.value = formatted;
        onValueChange?.(formatted);
      }}
    />
  );
}
