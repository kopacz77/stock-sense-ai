import { create } from 'zustand';

type TabType = 'monitoring' | 'discovery' | 'analysis' | 'market';

interface UIState {
  activeTab: TabType;
  sidebarOpen: boolean;
  theme: 'dark' | 'light';

  // Actions
  setActiveTab: (tab: TabType) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'monitoring',
  sidebarOpen: true,
  theme: 'dark',

  setActiveTab: (activeTab) => set({ activeTab }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setTheme: (theme) => set({ theme }),
}));
