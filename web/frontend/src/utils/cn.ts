import clsx, { ClassValue } from 'clsx';

/**
 * Utility function to merge Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
