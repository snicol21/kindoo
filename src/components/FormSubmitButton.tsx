'use client';

import { Button, type ButtonProps } from '@/components/_ui/button';
import { useFormStatus } from 'react-dom';

type FormSubmitButtonProps = Omit<ButtonProps, 'type' | 'isLoading' | 'loadingText'> & {
  loadingText: string;
};

export function FormSubmitButton({
  loadingText,
  children,
  disabled,
  ...props
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={disabled || pending}
      isLoading={pending}
      loadingText={loadingText}
      {...props}
    >
      {children}
    </Button>
  );
}
