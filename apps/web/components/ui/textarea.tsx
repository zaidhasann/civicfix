import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';

import { cn } from './utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, hint, id, label, ...props },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const descriptionId = `${textareaId}-description`;
  const errorId = `${textareaId}-error`;
  const describedBy = error ? errorId : hint ? descriptionId : undefined;

  return (
    <div className="space-y-2">
      {label ? (
        <label className="block text-sm font-semibold text-text" htmlFor={textareaId}>
          {label}
        </label>
      ) : null}
      <textarea
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          'min-h-32 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-text outline-none transition placeholder:text-neutral-500 focus:border-primary focus:ring-2 focus:ring-primary/25',
          error && 'border-danger focus:border-danger focus:ring-danger/25',
          className,
        )}
        id={textareaId}
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
