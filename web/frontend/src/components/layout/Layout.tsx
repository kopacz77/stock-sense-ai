import { ReactNode } from 'react';
import { Header } from './Header';
import { Tabs, Tab } from '@/components/ui/Tabs';
import { useUIStore } from '@/stores/useUIStore';
import { Activity, Compass, LineChart, Globe, Settings, HelpCircle } from 'lucide-react';

const tabs: Tab[] = [
  { id: 'monitoring', label: 'Monitoring', icon: <Activity className="w-4 h-4" /> },
  { id: 'discovery', label: 'Discovery', icon: <Compass className="w-4 h-4" /> },
  { id: 'analysis', label: 'Analysis', icon: <LineChart className="w-4 h-4" /> },
  { id: 'market', label: 'Market', icon: <Globe className="w-4 h-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  { id: 'help', label: 'Help', icon: <HelpCircle className="w-4 h-4" /> },
];

export interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-bg via-dark-bg-secondary to-dark-bg pb-12">
      <Header />

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Tab Navigation */}
        <nav
          className="mb-6 sm:mb-8 flex justify-center"
          role="navigation"
          aria-label="Main navigation"
        >
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(tab) => setActiveTab(tab as typeof activeTab)}
          />
        </nav>

        {/* Page Content */}
        <div role="main" aria-live="polite">
          {children}
        </div>
      </main>

      {/* Footer with keyboard shortcuts hint */}
      <footer className="fixed bottom-0 left-0 right-0 py-2 px-4 bg-dark-bg/80 backdrop-blur-md border-t border-dark-border">
        <div className="container mx-auto flex justify-center">
          <p className="text-xs text-dark-text-muted">
            <kbd className="px-1.5 py-0.5 bg-dark-surface rounded text-dark-text-tertiary font-mono">Ctrl</kbd>
            {' + '}
            <kbd className="px-1.5 py-0.5 bg-dark-surface rounded text-dark-text-tertiary font-mono">1-6</kbd>
            {' to switch tabs'}
          </p>
        </div>
      </footer>
    </div>
  );
}
