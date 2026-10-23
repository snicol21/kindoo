'use client';

import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import { OTHER_WARD_NAME_MAX_LENGTH } from '@/schema/schema';

interface OtherWardNameFieldProps {
  id: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string;
}

/** Free-text ward or unit name, shown only when the "Other" ward is selected. */
export function OtherWardNameField({
  id,
  name,
  value,
  defaultValue,
  onChange,
  error,
}: OtherWardNameFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Ward or unit name <span className="text-destructive">*</span>
      </Label>
      <Input
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        maxLength={OTHER_WARD_NAME_MAX_LENGTH}
        required
        placeholder="e.g. Riverton 3rd Ward"
        autoComplete="off"
        className={error ? 'border-destructive' : undefined}
      />
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          For wards or units not in the list. Up to {OTHER_WARD_NAME_MAX_LENGTH} characters.
        </p>
      )}
    </div>
  );
}
