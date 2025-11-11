import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Layout } from '@/components/layout/Layout';
import { MonitoringPage } from '@/pages/MonitoringPage';
import { DiscoveryPage } from '@/pages/DiscoveryPage';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { MarketPage } from '@/pages/MarketPage';
import { useUIStore } from '@/stores/useUIStore';
import { useSocket } from '@/hooks/useSocket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppContent() {
  const { activeTab } = useUIStore();

  // Initialize Socket.IO connection
  useSocket();

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            useUIStore.getState().setActiveTab('monitoring');
            break;
          case '2':
            e.preventDefault();
            useUIStore.getState().setActiveTab('discovery');
            break;
          case '3':
            e.preventDefault();
            useUIStore.getState().setActiveTab('analysis');
            break;
          case '4':
            e.preventDefault();
            useUIStore.getState().setActiveTab('market');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Layout>
      {activeTab === 'monitoring' && <MonitoringPage />}
      {activeTab === 'discovery' && <DiscoveryPage />}
      {activeTab === 'analysis' && <AnalysisPage />}
      {activeTab === 'market' && <MarketPage />}
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'rgba(30, 41, 59, 0.95)',
            color: '#e2e8f0',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            backdropFilter: 'blur(20px)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </QueryClientProvider>
  );
}
