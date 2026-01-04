import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Loader2, Search, TrendingUp, AlertCircle, Inbox } from 'lucide-react';

export interface LoadingSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

const sizeStyles = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export function LoadingSpinner({ size = 'md', message, className }: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('flex flex-col items-center justify-center gap-3', className)}
    >
      <Loader2
        className={cn('animate-spin text-primary-500', sizeStyles[size])}
        aria-hidden="true"
      />
      {message && <p className="text-sm text-dark-text-tertiary">{message}</p>}
      <span className="sr-only">{message || 'Loading...'}</span>
    </div>
  );
}

export interface LoadingCardProps {
  message?: string;
}

export function LoadingCard({ message = 'Loading...' }: LoadingCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex flex-col items-center justify-center p-8 sm:p-12 bg-dark-surface/30 rounded-xl border border-dashed border-dark-border backdrop-blur-md"
    >
      <LoadingSpinner size="lg" message={message} />
    </div>
  );
}

// Skeleton loading components
export function SkeletonCard() {
  return (
    <div className="animate-pulse bg-dark-surface/30 rounded-xl border border-dark-border p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-dark-surface rounded-lg" />
        <div className="flex-1">
          <div className="h-4 bg-dark-surface rounded w-1/3 mb-2" />
          <div className="h-3 bg-dark-surface rounded w-1/2" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 bg-dark-surface rounded w-full" />
        <div className="h-3 bg-dark-surface rounded w-4/5" />
        <div className="h-3 bg-dark-surface rounded w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading content">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
      <span className="sr-only">Loading content...</span>
    </div>
  );
}

// Empty state component
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: 'default' | 'search' | 'opportunities' | 'error';
}

const variantIcons = {
  default: Inbox,
  search: Search,
  opportunities: TrendingUp,
  error: AlertCircle,
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'default',
}: EmptyStateProps) {
  const IconComponent = variantIcons[variant];

  return (
    <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center">
      <div className="mb-4 p-4 bg-dark-surface/50 rounded-full">
        {icon || <IconComponent className="w-8 h-8 sm:w-10 sm:h-10 text-dark-text-muted" aria-hidden="true" />}
      </div>
      <h3 className="text-lg sm:text-xl font-semibold text-dark-text-primary mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-dark-text-tertiary max-w-md mb-4">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
