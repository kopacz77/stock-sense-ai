import { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Main navigation tabs"
      className={cn(
        'flex gap-1 sm:gap-2',
        'bg-dark-surface/50 backdrop-blur-md',
        'p-1 rounded-xl',
        'border border-dark-border',
        className
      )}
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          role="tab"
          id={`tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={`panel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => {
            // Arrow key navigation
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              const nextIndex = (index + 1) % tabs.length;
              const nextTab = tabs[nextIndex];
              if (nextTab) onChange(nextTab.id);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              const prevIndex = (index - 1 + tabs.length) % tabs.length;
              const prevTab = tabs[prevIndex];
              if (prevTab) onChange(prevTab.id);
            }
          }}
          className={cn(
            'relative flex items-center gap-2',
            'px-3 sm:px-6 py-2.5 sm:py-3',
            'rounded-lg',
            'font-medium text-sm',
            'transition-all duration-300',
            'overflow-hidden',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-dark-bg',
            activeTab === tab.id
              ? [
                  'text-white',
                  'bg-gradient-to-br from-primary-500 to-primary-700',
                  'shadow-lg shadow-primary-500/30',
                ]
              : [
                  'text-dark-text-secondary',
                  'hover:text-white hover:bg-dark-surface',
                ]
          )}
        >
          {/* Shimmer effect on active tab */}
          {activeTab === tab.id && (
            <span
              className="absolute inset-0 -left-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"
              aria-hidden="true"
            />
          )}

          {tab.icon && (
            <span className="relative" aria-hidden="true">
              {tab.icon}
            </span>
          )}
          <span className="relative hidden sm:inline">{tab.label}</span>
          <span className="sr-only sm:hidden">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
