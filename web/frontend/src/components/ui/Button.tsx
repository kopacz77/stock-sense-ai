import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from '@/utils/cn';

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
  warning: 'bg-gradient-to-br from-warning-500 to-warning-700 border-warning-500/30',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
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
          // Disabled state
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none',
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
        <span className="absolute inset-0 -left-full transition-all duration-500 ease-in-out hover:left-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Content */}
        <span className="relative flex items-center gap-2">
          {loading && (
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
          {children}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';
