import { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  glow?: boolean;
}

export function Card({ children, hover = true, glow = true, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        // Base glassmorphic styles
        'relative',
        'bg-dark-surface backdrop-blur-xl',
        'rounded-2xl',
        'p-6',
        'border border-dark-border',
        'shadow-glass',
        // Transitions
        'transition-all duration-300 ease-in-out',
        // Hover effects
        hover && [
          'hover:-translate-y-1',
          'hover:border-dark-border-hover',
          'hover:shadow-glass-lg',
        ],
        // Overflow for gradient top border
        'overflow-hidden',
        className
      )}
      {...props}
    >
      {/* Gradient top border on hover */}
      {glow && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary-500 via-success-500 to-warning-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      )}
      {children}
    </div>
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  icon?: ReactNode;
}

export function CardHeader({ children, icon, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn('flex items-center gap-2 mb-4', className)}
      {...props}
    >
      {icon && <span className="text-xl">{icon}</span>}
      <h2 className="text-xl font-semibold text-white">{children}</h2>
    </div>
  );
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardContent({ children, className, ...props }: CardContentProps) {
  return (
    <div className={cn('text-gray-300', className)} {...props}>
      {children}
    </div>
  );
}
