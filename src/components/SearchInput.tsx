'use client';

import { Input } from '@/components/_ui/input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';

type SearchInputProps = {
  value: string;
  onValueChangeAction: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function SearchInput({
  value,
  onValueChangeAction,
  placeholder = 'Search',
  className,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onValueChangeAction(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}
