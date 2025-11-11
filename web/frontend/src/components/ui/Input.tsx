import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          // Base styles
          'px-4 py-3',
          'rounded-lg',
          'bg-dark-surface-hover',
          'border border-dark-border',
          'text-white placeholder:text-gray-500',
          'transition-all duration-300',
          // Focus state
          'focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500',
          // Error state
          error && 'border-danger-500 focus:ring-danger-500/50',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
