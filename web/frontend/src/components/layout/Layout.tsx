import { ReactNode } from 'react';
import { Header } from './Header';
import { Tabs, Tab } from '@/components/ui/Tabs';
import { useUIStore } from '@/stores/useUIStore';

const tabs: Tab[] = [
  { id: 'monitoring', label: 'Monitoring', icon: '🔄' },
  { id: 'discovery', label: 'Discovery', icon: '🔍' },
  { id: 'analysis', label: 'Analysis', icon: '📈' },
  { id: 'market', label: 'Market', icon: '🌍' },
];

export interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-bg via-dark-bg-secondary to-dark-bg">
      <Header />

      <main className="container mx-auto px-6 py-8">
        {/* Tab Navigation */}
        <div className="mb-8 flex justify-center">
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onChange={(tab) => setActiveTab(tab as typeof activeTab)}
          />
        </div>

        {/* Page Content */}
        {children}
      </main>
    </div>
  );
}
