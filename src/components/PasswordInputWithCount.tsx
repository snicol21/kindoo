'use client';

import type { InputProps } from '@/components/_ui/input';
import { PasswordInput } from '@/components/_ui/password-input';
import { cn } from '@/lib/utils';
import { useState } from 'react';

type PasswordInputWithCountProps = {
  id?: string;
  name: string;
  minLength?: number;
  className?: string;
} & Omit<InputProps, 'type' | 'value' | 'onChange' | 'minLength' | 'id' | 'name'>;

export function PasswordInputWithCount({
  id,
  name,
  minLength = 0,
  className,
  ...inputProps
}: PasswordInputWithCountProps) {
  const [length, setLength] = useState(0);

  return (
    <div className={cn('space-y-1.5', className)}>
      <PasswordInput
        id={id}
        name={name}
        minLength={minLength || undefined}
        {...inputProps}
        onChange={(event) => setLength(event.target.value.length)}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{minLength ? `Minimum ${minLength} characters` : 'Character count'}</span>
        <span>
          {length}
          {minLength ? `/${minLength}` : ''}
        </span>
      </div>
    </div>
  );
}
