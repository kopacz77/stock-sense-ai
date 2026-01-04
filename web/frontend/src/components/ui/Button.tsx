import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-br from-primary-500 to-primary-700 border-primary-500/30 hover:shadow-glow-blue',
  secondary: 'bg-dark-surface border-dark-border hover:bg-dark-surface-hover hover:border-dark-border-hover',
  success: 'bg-gradient-to-br from-success-500 to-success-700 border-success-500/30 hover:shadow-glow-green',
  danger: 'bg-gradient-to-br from-danger-500 to-danger-700 border-danger-500/30 hover:shadow-glow-red',
  warning: 'bg-gradient-to-br from-warning-500 to-warning-700 border-warning-500/30 hover:shadow-glow-yellow',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-sm min-h-[36px]',
  md: 'px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base min-h-[44px]',
  lg: 'px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg min-h-[52px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        aria-busy={loading}
        className={cn(
          // Base styles
          'relative inline-flex items-center justify-center',
          'font-semibold uppercase tracking-wide',
          'border rounded-lg',
          'transition-all duration-300 ease-in-out',
          'text-white',
          'overflow-hidden',
          // Hover effects
          'hover:-translate-y-0.5',
          // Focus visible states
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-bg',
          // Disabled state
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-none',
          // Variant styles
          variantStyles[variant],
          // Size styles
          sizeStyles[size],
          // Custom className
          className
        )}
        {...props}
      >
        {/* Shimmer effect */}
        <span
          className="absolute inset-0 -left-full transition-all duration-500 ease-in-out hover:left-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
          aria-hidden="true"
        />

        {/* Content */}
        <span className="relative flex items-center gap-2">
          {loading && (
            <Loader2
              className="w-4 h-4 animate-spin"
              aria-hidden="true"
            />
          )}
          {children}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
