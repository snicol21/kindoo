import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  width?: 'narrow' | 'full';
}

const widthClasses: Record<NonNullable<PageContainerProps['width']>, string> = {
  narrow: 'max-w-4xl',
  full: 'max-w-7xl',
};

export function PageContainer({ children, className, width = 'full' }: PageContainerProps) {
  return (
    <div className={cn('container mx-auto px-4 py-8', widthClasses[width], className)}>
      {children}
    </div>
  );
}
