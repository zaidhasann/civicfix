import { Button } from './button';
import { cn } from './utils';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  className,
  message = 'We could not load this content. Please try again.',
  onRetry,
  title = 'Something went wrong',
}: ErrorStateProps) {
  return (
    <div
      className={cn('rounded-lg border border-danger/30 bg-danger/5 p-8 text-center', className)}
      role="alert"
    >
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">{message}</p>
      {onRetry ? (
        <Button className="mt-5" onClick={onRetry} variant="secondary">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
