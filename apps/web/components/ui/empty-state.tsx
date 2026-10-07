import { Button } from './button';
import { cn } from './utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  actionLabel,
  className,
  description,
  onAction,
  title,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed border-border bg-surface p-8 text-center',
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button className="mt-5" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
