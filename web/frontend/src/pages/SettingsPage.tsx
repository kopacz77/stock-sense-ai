import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingCard } from '@/components/ui/LoadingSpinner';
import { api } from '@/services/api';
import type { SystemSettings } from '@/types/trading';
import {
  Settings,
  RefreshCw,
  Activity,
  Database,
  TrendingUp,
  BarChart3,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Gauge,
  LineChart,
  Layers,
  Zap,
} from 'lucide-react';

interface FeatureToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  icon: React.ReactNode;
}

function FeatureToggle({ label, description, enabled, icon }: FeatureToggleProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-dark-bg/60 rounded-lg border border-dark-border">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${enabled ? 'bg-success-500/20 text-success-400' : 'bg-dark-surface text-dark-text-muted'}`}>
          {icon}
        </div>
        <div>
          <p className="font-medium text-dark-text-primary">{label}</p>
          <p className="text-xs text-dark-text-tertiary">{description}</p>
        </div>
      </div>
      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
        enabled
          ? 'bg-success-500/20 text-success-400'
          : 'bg-dark-surface text-dark-text-muted'
      }`}>
        {enabled ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
        {enabled ? 'Active' : 'Inactive'}
      </div>
    </div>
  );
}

interface StatusCardProps {
  title: string;
  status: boolean;
  icon: React.ReactNode;
  details?: string;
}

function StatusCard({ title, status, icon, details }: StatusCardProps) {
  return (
    <div className={`p-4 rounded-lg border ${
      status
        ? 'bg-success-500/10 border-success-500/30'
        : 'bg-danger-500/10 border-danger-500/30'
    }`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={status ? 'text-success-400' : 'text-danger-400'}>
          {icon}
        </div>
        <span className="font-medium text-dark-text-primary">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        {status ? (
          <CheckCircle className="w-4 h-4 text-success-400" />
        ) : (
          <XCircle className="w-4 h-4 text-danger-400" />
        )}
        <span className={`text-sm ${status ? 'text-success-400' : 'text-danger-400'}`}>
          {status ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      {details && (
        <p className="mt-2 text-xs text-dark-text-tertiary">{details}</p>
      )}
    </div>
  );
}

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SystemSettings | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to load settings: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <LoadingCard message="Loading system settings..." />
      </motion.div>
    );
  }

  if (!settings) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12"
      >
        <AlertTriangle className="w-12 h-12 text-warning-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-dark-text-primary mb-2">Failed to Load Settings</h3>
        <p className="text-dark-text-tertiary mb-4">Unable to retrieve system configuration.</p>
        <Button variant="primary" onClick={fetchSettings}>
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary-400" />
          <h1 className="text-xl font-semibold text-dark-text-primary">System Settings</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchSettings}>
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Data Provider Status */}
      <Card>
        <CardHeader icon={<Database className="w-5 h-5" />}>
          Data Providers
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <StatusCard
              title="Alpha Vantage"
              status={settings.dataProviders.alphaVantage}
              icon={<TrendingUp className="w-5 h-5" />}
              details="Primary market data provider for historical prices and quotes"
            />
            <StatusCard
              title="Finnhub"
              status={settings.dataProviders.finnhub}
              icon={<BarChart3 className="w-5 h-5" />}
              details="Secondary provider for real-time data and news"
            />
          </div>
          {settings.dataProviders.errors.length > 0 && (
            <div className="mt-4 p-3 bg-warning-500/10 border border-warning-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-warning-400" />
                <span className="text-sm font-medium text-warning-400">Provider Errors</span>
              </div>
              <ul className="space-y-1">
                {settings.dataProviders.errors.map((error, index) => (
                  <li key={index} className="text-xs text-dark-text-tertiary">{error}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitoring Status */}
      <Card>
        <CardHeader icon={<Activity className="w-5 h-5" />}>
          Monitoring Status
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 bg-dark-bg/60 rounded-lg border border-dark-border">
              <p className="text-sm text-dark-text-tertiary mb-1">Status</p>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${settings.monitoring.isRunning ? 'bg-success-400 animate-pulse' : 'bg-dark-text-muted'}`} />
                <span className={`font-medium ${settings.monitoring.isRunning ? 'text-success-400' : 'text-dark-text-secondary'}`}>
                  {settings.monitoring.isRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>
            <div className="p-4 bg-dark-bg/60 rounded-lg border border-dark-border">
              <p className="text-sm text-dark-text-tertiary mb-1">Scan Interval</p>
              <p className="font-medium text-dark-text-primary">{settings.monitoring.interval} seconds</p>
            </div>
            <div className="p-4 bg-dark-bg/60 rounded-lg border border-dark-border">
              <p className="text-sm text-dark-text-tertiary mb-1">Total Scans</p>
              <p className="font-medium text-dark-text-primary">{settings.monitoring.totalScans}</p>
            </div>
            <div className="p-4 bg-dark-bg/60 rounded-lg border border-dark-border">
              <p className="text-sm text-dark-text-tertiary mb-1">Last Scan</p>
              <p className="font-medium text-dark-text-primary">
                {settings.monitoring.lastScan
                  ? new Date(settings.monitoring.lastScan).toLocaleTimeString()
                  : 'Never'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Technical Indicators */}
      <Card>
        <CardHeader icon={<LineChart className="w-5 h-5" />}>
          Technical Indicators
        </CardHeader>
        <CardContent>
          <p className="text-sm text-dark-text-tertiary mb-4">
            All technical indicators are calculated automatically when analyzing stocks.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureToggle
              label="RSI"
              description="Relative Strength Index (14-period)"
              enabled={settings.features.rsi}
              icon={<Gauge className="w-4 h-4" />}
            />
            <FeatureToggle
              label="MACD"
              description="Moving Average Convergence Divergence"
              enabled={settings.features.macd}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <FeatureToggle
              label="Bollinger Bands"
              description="20-period with 2 std deviations"
              enabled={settings.features.bollingerBands}
              icon={<Layers className="w-4 h-4" />}
            />
            <FeatureToggle
              label="Moving Averages"
              description="SMA (20, 50, 200) and EMA (12, 26)"
              enabled={settings.features.movingAverages}
              icon={<LineChart className="w-4 h-4" />}
            />
            <FeatureToggle
              label="Stochastic"
              description="Stochastic Oscillator (K: 14, D: 3)"
              enabled={settings.features.stochastic}
              icon={<Activity className="w-4 h-4" />}
            />
            <FeatureToggle
              label="CCI"
              description="Commodity Channel Index (14-period)"
              enabled={settings.features.cci}
              icon={<BarChart3 className="w-4 h-4" />}
            />
            <FeatureToggle
              label="Williams %R"
              description="Williams Percent Range (14-period)"
              enabled={settings.features.williamsR}
              icon={<Zap className="w-4 h-4" />}
            />
            <FeatureToggle
              label="ATR"
              description="Average True Range (14-period)"
              enabled={settings.features.atr}
              icon={<Activity className="w-4 h-4" />}
            />
            <FeatureToggle
              label="Volume Profile"
              description="Volume analysis with trend detection"
              enabled={settings.features.volumeProfile}
              icon={<BarChart3 className="w-4 h-4" />}
            />
            <FeatureToggle
              label="Market Regime"
              description="Trend, volatility, and regime detection"
              enabled={settings.features.marketRegime}
              icon={<TrendingUp className="w-4 h-4" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Risk Metrics */}
      <Card>
        <CardHeader icon={<Shield className="w-5 h-5" />}>
          Risk Metrics
        </CardHeader>
        <CardContent>
          <p className="text-sm text-dark-text-tertiary mb-4">
            Advanced risk analysis capabilities for portfolio management.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureToggle
              label="Value at Risk (VaR)"
              description="Historical, Parametric, and Monte Carlo methods"
              enabled={settings.riskMetrics.varEnabled}
              icon={<Shield className="w-4 h-4" />}
            />
            <FeatureToggle
              label="CVaR / Expected Shortfall"
              description="Tail risk analysis beyond VaR threshold"
              enabled={settings.riskMetrics.cvarEnabled}
              icon={<AlertTriangle className="w-4 h-4" />}
            />
            <FeatureToggle
              label="Volatility Analysis"
              description="GARCH modeling and volatility forecasting"
              enabled={settings.riskMetrics.volatilityAnalysis}
              icon={<Activity className="w-4 h-4" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Info Panel */}
      <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-lg">
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-primary-400 mt-0.5" />
          <div>
            <p className="font-medium text-primary-300 mb-1">Configuration Note</p>
            <p className="text-sm text-dark-text-tertiary">
              All analysis features are enabled by default. To configure API keys and other settings,
              update your <code className="px-1.5 py-0.5 bg-dark-surface rounded text-xs">.env</code> file
              and restart the application. Visit the Help page for more information.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
