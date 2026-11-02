import type { HTMLAttributes } from 'react';

import { cn } from './utils';

const badgeVariants = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
  info: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning',
  danger: 'bg-danger/15 text-danger',
} as const;

export type BadgeVariant = keyof typeof badgeVariants;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  statusText?: string;
}

export function Badge({
  children,
  className,
  statusText,
  variant = 'neutral',
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        badgeVariants[variant],
        className,
      )}
      {...props}
    >
      {children}
      {statusText ? <span className="sr-only">: {statusText}</span> : null}
    </span>
  );
}
