import { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface StatusIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'danger' | 'warning';
  glow?: boolean;
}

const variantStyles = {
  default: 'from-primary-500 to-success-500',
  success: 'text-success-400',
  danger: 'text-danger-400',
  warning: 'text-warning-400',
};

const glowStyles = {
  default: '',
  success: 'drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]',
  danger: 'drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]',
  warning: 'drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]',
};

export function StatusIndicator({
  label,
  value,
  variant = 'default',
  glow = false,
  className,
  ...props
}: StatusIndicatorProps) {
  return (
    <div
      role="status"
      aria-label={`${label}: ${value}`}
      className={cn(
        'relative bg-dark-bg/60 border border-dark-border rounded-xl p-4 sm:p-5',
        'text-center transition-all duration-300',
        'hover:border-dark-border-hover hover:-translate-y-0.5',
        'overflow-hidden',
        className
      )}
      {...props}
    >
      {/* Gradient top border */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary-500 to-success-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      />

      <div
        className={cn(
          'text-2xl sm:text-3xl font-bold mb-1 sm:mb-2',
          variant === 'default'
            ? `bg-gradient-to-br ${variantStyles[variant]} bg-clip-text text-transparent`
            : variantStyles[variant],
          glow && glowStyles[variant]
        )}
        aria-hidden="true"
      >
        {value}
      </div>
      <div className="text-xs text-dark-text-tertiary uppercase tracking-wider font-medium">
        {label}
      </div>

      {/* Screen reader text */}
      <span className="sr-only">
        {label}: {value}
        {variant !== 'default' && ` (${variant} status)`}
      </span>
    </div>
  );
}
