import { forwardRef, useId, type InputHTMLAttributes } from 'react';

import { cn } from './utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, hint, id, label, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? descriptionId : undefined;

  return (
    <div className="space-y-2">
      {label ? (
        <label className="block text-sm font-semibold text-text" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          'min-h-11 w-full rounded-md border border-border bg-surface px-3 text-text outline-none transition placeholder:text-neutral-500 focus:border-primary focus:ring-2 focus:ring-primary/25',
          error && 'border-danger focus:border-danger focus:ring-danger/25',
          className,
        )}
        id={inputId}
        ref={ref}
        {...props}
      />
      {error ? (
        <p className="text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-300" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
});
