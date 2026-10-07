import { cn } from './utils';

export function LoadingState({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn(
        'flex min-h-32 items-center justify-center gap-3 text-sm text-neutral-600',
        className,
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
      />
      <span>{label}</span>
    </div>
  );
}
