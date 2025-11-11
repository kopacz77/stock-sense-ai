import { forwardRef, SelectHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          // Base styles
          'px-4 py-3',
          'rounded-lg',
          'bg-dark-surface-hover',
          'border border-dark-border',
          'text-white',
          'transition-all duration-300',
          // Focus state
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500',
          // Error state
          error && 'border-danger-500 focus:ring-danger-500/50',
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = 'Select';
