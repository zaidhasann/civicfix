'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { cn } from './utils';

const toastVariants = {
  info: 'border-primary/40',
  success: 'border-success/40',
  warning: 'border-warning/50',
  danger: 'border-danger/50',
} as const;

export type ToastVariant = keyof typeof toastVariants;

export interface ToastProps {
  title: string;
  description?: string;
  variant?: ToastVariant;
  onDismiss?: () => void;
}

export function Toast({ title, description, variant = 'info', onDismiss }: ToastProps) {
  return (
    <div
      aria-live={variant === 'danger' ? 'assertive' : 'polite'}
      className={cn(
        'w-full rounded-lg border bg-surface p-4 text-text shadow-card',
        toastVariants[variant],
      )}
      role={variant === 'danger' ? 'alert' : 'status'}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{title}</p>
          {description ? (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{description}</p>
          ) : null}
        </div>
        {onDismiss ? (
          <button
            aria-label={`Dismiss ${title}`}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-neutral-800"
            onClick={onDismiss}
            type="button"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

interface ToastItem extends ToastProps {
  id: number;
}

export type ToastInput = Omit<ToastProps, 'onDismiss'>;

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const value = useMemo<ToastContextValue>(
    () => ({
      toast: (input) => {
        const id = Date.now();
        setToasts((current) => [...current, { ...input, id }]);
      },
    }),
    [],
  );

  function dismiss(id: number) {
    setToasts((current) => current.filter((toastItem) => toastItem.id !== id));
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="Notifications"
        className="fixed bottom-5 right-5 z-40 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col gap-3"
        role="region"
      >
        {toasts.map(({ id, ...toastItem }) => (
          <Toast key={id} {...toastItem} onDismiss={() => dismiss(id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
