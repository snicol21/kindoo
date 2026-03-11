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
  disabled?: boolean;
  onValueChange?: (value: string) => void;
};

export function PhoneInput({
  id,
  name,
  defaultValue,
  value,
  placeholder = '(555) 000-0000',
  required,
  disabled,
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
      disabled={disabled}
      onChange={(event) => {
        const formatted = formatPhone(event.target.value);
        event.target.value = formatted;
        onValueChange?.(formatted);
      }}
    />
  );
}
