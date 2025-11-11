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
      className={cn(
        'flex gap-2',
        'bg-dark-surface/50 backdrop-blur-md',
        'p-1 rounded-xl',
        'border border-dark-border',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative flex items-center gap-2',
            'px-6 py-3',
            'rounded-lg',
            'font-medium text-sm',
            'transition-all duration-300',
            'overflow-hidden',
            activeTab === tab.id
              ? [
                  'text-white',
                  'bg-gradient-to-br from-primary-500 to-primary-700',
                  'shadow-lg shadow-primary-500/30',
                ]
              : [
                  'text-gray-400',
                  'hover:text-white hover:bg-dark-surface',
                ]
          )}
        >
          {/* Shimmer effect on active tab */}
          {activeTab === tab.id && (
            <span className="absolute inset-0 -left-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          )}

          {tab.icon && <span className="text-lg">{tab.icon}</span>}
          <span className="relative">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
