import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export type BadgeVariant = 'primary' | 'success' | 'danger' | 'warning' | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
  glow?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-gradient-to-br from-primary-500 to-primary-700 text-white border-primary-500/30',
  success: 'bg-gradient-to-br from-success-500 to-success-700 text-white border-success-500/30',
  danger: 'bg-gradient-to-br from-danger-500 to-danger-700 text-white border-danger-500/30',
  warning: 'bg-gradient-to-br from-warning-500 to-warning-700 text-white border-warning-500/30',
  neutral: 'bg-dark-surface text-gray-300 border-dark-border',
};

const glowStyles: Record<BadgeVariant, string> = {
  primary: 'shadow-glow-blue',
  success: 'shadow-glow-green',
  danger: 'shadow-glow-red',
  warning: 'shadow-[0_0_20px_rgba(245,158,11,0.4)]',
  neutral: '',
};

export function Badge({
  variant = 'neutral',
  glow = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-3 py-1.5',
        'text-xs font-bold uppercase tracking-wide',
        'rounded-lg border',
        'transition-all duration-300',
        variantStyles[variant],
        glow && glowStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
