import type {
  MonitoringConfig,
  DiscoveryConfig,
  Opportunity,
  AnalysisResult,
  MarketOverview,
} from '@/types/trading';

const API_BASE = '/api';

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new ApiError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      errorText
    );
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Monitoring endpoints
  async startMonitoring(config: MonitoringConfig): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${API_BASE}/monitoring/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return handleResponse(response);
  },

  async stopMonitoring(): Promise<{ success: boolean; error?: string }> {
    const response = await fetch(`${API_BASE}/monitoring/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleResponse(response);
  },

  // Discovery endpoints
  async discover(config: DiscoveryConfig): Promise<Opportunity[]> {
    const response = await fetch(`${API_BASE}/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return handleResponse(response);
  },

  // Analysis endpoints
  async analyzeStock(symbol: string): Promise<AnalysisResult> {
    const response = await fetch(`${API_BASE}/analyze/${encodeURIComponent(symbol)}`);
    return handleResponse(response);
  },

  // Market endpoints
  async getMarketOverview(): Promise<MarketOverview> {
    const response = await fetch(`${API_BASE}/market/overview`);
    return handleResponse(response);
  },
};

export { ApiError };
