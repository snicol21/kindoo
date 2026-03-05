'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [isVisible, setIsVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          className={cn('pr-10', className)}
          {...props}
        />
        <button
          type="button"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => setIsVisible((prev) => !prev)}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

export { PasswordInput };
