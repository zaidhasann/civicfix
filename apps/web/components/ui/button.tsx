import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from './utils';

const buttonVariants = {
  primary: 'bg-primary text-white hover:opacity-90',
  secondary:
    'border border-border bg-surface text-text hover:bg-neutral-100 dark:hover:bg-neutral-800',
  danger: 'bg-danger text-white hover:opacity-90',
  ghost: 'text-text hover:bg-neutral-100 dark:hover:bg-neutral-800',
} as const;

const buttonSizes = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingLabel = 'Loading',
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      ref={ref}
      {...props}
    >
      {loading ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});
