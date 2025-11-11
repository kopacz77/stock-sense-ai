import { create } from 'zustand';
import type {
  MonitoringStats,
  MarketOverview,
  Opportunity,
  ChartDataPoint,
} from '@/types/trading';

interface TradingState {
  stats: MonitoringStats;
  overview: MarketOverview;
  opportunities: Opportunity[];
  chartData: ChartDataPoint[];
  isConnected: boolean;

  // Actions
  setStats: (stats: MonitoringStats) => void;
  setOverview: (overview: MarketOverview) => void;
  setOpportunities: (opportunities: Opportunity[]) => void;
  setChartData: (chartData: ChartDataPoint[]) => void;
  setConnected: (isConnected: boolean) => void;
  updateDashboard: (data: {
    stats: MonitoringStats;
    overview: MarketOverview;
    opportunities: Opportunity[];
    chartData: ChartDataPoint[];
  }) => void;
}

const defaultStats: MonitoringStats = {
  isRunning: false,
  uptime: 0,
  totalScans: 0,
  opportunitiesFound: 0,
  alertsSent: 0,
  apiCallsToday: 0,
};

const defaultOverview: MarketOverview = {
  marketSentiment: 'NEUTRAL',
  bullishSignals: 0,
  bearishSignals: 0,
  totalAnalyzed: 0,
  topSectors: [],
};

export const useTradingStore = create<TradingState>((set) => ({
  stats: defaultStats,
  overview: defaultOverview,
  opportunities: [],
  chartData: [],
  isConnected: false,

  setStats: (stats) => set({ stats }),
  setOverview: (overview) => set({ overview }),
  setOpportunities: (opportunities) => set({ opportunities }),
  setChartData: (chartData) => set({ chartData }),
  setConnected: (isConnected) => set({ isConnected }),

  updateDashboard: (data) => set({
    stats: data.stats,
    overview: data.overview,
    opportunities: data.opportunities,
    chartData: data.chartData,
  }),
}));
