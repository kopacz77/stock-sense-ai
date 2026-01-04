import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { Layout } from '@/components/layout/Layout';
import { MonitoringPage } from '@/pages/MonitoringPage';
import { DiscoveryPage } from '@/pages/DiscoveryPage';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { MarketPage } from '@/pages/MarketPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { HelpPage } from '@/pages/HelpPage';
import { useUIStore } from '@/stores/useUIStore';
import { useSocket } from '@/hooks/useSocket';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

// Sync URL with tab state
function TabRouteSync() {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeTab, setActiveTab } = useUIStore();

  // Sync activeTab from URL on mount and URL changes
  useEffect(() => {
    const pathSegment = location.pathname.split('/')[1] || 'monitoring';
    const validTabs = ['monitoring', 'discovery', 'analysis', 'market', 'settings', 'help'];
    if (validTabs.includes(pathSegment) && pathSegment !== activeTab) {
      setActiveTab(pathSegment as typeof activeTab);
    }
  }, [location.pathname, setActiveTab]); // Removed activeTab to prevent loop

  // Navigate when activeTab changes (from keyboard shortcuts, etc.)
  useEffect(() => {
    const pathSegment = location.pathname.split('/')[1] || 'monitoring';
    // Only navigate if activeTab differs from current path segment
    if (pathSegment !== activeTab && activeTab) {
      navigate(`/${activeTab}`, { replace: true });
    }
  }, [activeTab, navigate]); // Removed location.pathname to prevent loop

  return null;
}

function AppContent() {
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
          case '5':
            e.preventDefault();
            useUIStore.getState().setActiveTab('settings');
            break;
          case '6':
            e.preventDefault();
            useUIStore.getState().setActiveTab('help');
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <TabRouteSync />
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/monitoring" replace />} />
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/discovery" element={<DiscoveryPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/analysis/:symbol" element={<AnalysisPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<Navigate to="/monitoring" replace />} />
        </Routes>
      </Layout>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 5000,
            style: {
              background: 'rgba(30, 41, 59, 0.95)',
              color: '#f1f5f9',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              backdropFilter: 'blur(20px)',
              borderRadius: '12px',
              padding: '16px',
              fontSize: '14px',
              fontWeight: 500,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            },
            success: {
              duration: 4000,
              iconTheme: {
                primary: '#22c55e',
                secondary: '#ffffff',
              },
              style: {
                borderColor: 'rgba(34, 197, 94, 0.3)',
              },
            },
            error: {
              duration: 6000,
              iconTheme: {
                primary: '#ef4444',
                secondary: '#ffffff',
              },
              style: {
                borderColor: 'rgba(239, 68, 68, 0.3)',
              },
            },
            loading: {
              iconTheme: {
                primary: '#3b82f6',
                secondary: '#ffffff',
              },
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
