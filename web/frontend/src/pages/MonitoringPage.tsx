import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { LoadingCard } from '@/components/ui/LoadingSpinner';
import { PerformanceChart } from '@/components/charts/PerformanceChart';
import { OpportunityCard } from '@/components/opportunities/OpportunityCard';
import { useTradingStore } from '@/stores/useTradingStore';
import { api } from '@/services/api';
import { formatUptime } from '@/utils/formatters';

const SECTOR_OPTIONS = [
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'HEALTHCARE', label: 'Healthcare' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'GROWTH', label: 'Growth' },
];

export function MonitoringPage() {
  const { stats, overview, opportunities, chartData } = useTradingStore();

  const [interval, setInterval] = useState('90');
  const [sectors, setSectors] = useState<string[]>([]);
  const [includeTrending, setIncludeTrending] = useState(false);
  const [confidence, setConfidence] = useState('75');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const handleStartMonitoring = async () => {
    setIsStarting(true);
    try {
      const result = await api.startMonitoring({
        interval: Number(interval),
        sectors,
        trending: includeTrending,
        confidence: Number(confidence),
        maxResults: 20,
      });

      if (result.success) {
        toast.success(
          `Monitoring Started!\n\nInterval: ${interval} minutes\nSectors: ${sectors.join(', ') || 'SP500'}\nTrending: ${includeTrending ? 'Yes' : 'No'}\nConfidence: ${confidence}%`,
          { duration: 5000 }
        );
      } else {
        toast.error(result.error || 'Failed to start monitoring');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to start monitoring: ${message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopMonitoring = async () => {
    setIsStopping(true);
    try {
      const result = await api.stopMonitoring();

      if (result.success) {
        toast.success('Monitoring stopped successfully!');
      } else {
        toast.error(result.error || 'Failed to stop monitoring');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to stop monitoring: ${message}`);
    } finally {
      setIsStopping(false);
    }
  };

  const sentimentColor = overview.marketSentiment === 'BULLISH' ? 'success' : overview.marketSentiment === 'BEARISH' ? 'danger' : 'warning';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monitoring Controls */}
        <Card>
          <CardHeader icon="🎮">Monitoring Controls</CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="success"
                  onClick={handleStartMonitoring}
                  loading={isStarting}
                  disabled={stats.isRunning}
                >
                  {stats.isRunning ? '🟢 Running' : 'Start Monitoring'}
                </Button>
                <Button
                  variant="danger"
                  onClick={handleStopMonitoring}
                  loading={isStopping}
                  disabled={!stats.isRunning}
                >
                  Stop Monitoring
                </Button>
                <Select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="w-32"
                >
                  <option value="60">60 min</option>
                  <option value="90">90 min</option>
                  <option value="120">2 hours</option>
                  <option value="180">3 hours</option>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={includeTrending}
                    onChange={(e) => setIncludeTrending(e.target.checked)}
                    className="w-4 h-4 rounded accent-primary-500"
                  />
                  Include Trending
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-300">Confidence:</label>
                  <Input
                    type="number"
                    value={confidence}
                    onChange={(e) => setConfidence(e.target.value)}
                    min="60"
                    max="95"
                    className="w-20"
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status */}
        <Card>
          <CardHeader icon="🔄">Status</CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatusIndicator
                label="Status"
                value={stats.isRunning ? 'RUNNING' : 'STOPPED'}
                variant={stats.isRunning ? 'success' : 'danger'}
                glow={stats.isRunning}
              />
              <StatusIndicator
                label="Uptime"
                value={formatUptime(stats.uptime)}
                variant="default"
              />
              <StatusIndicator
                label="Total Scans"
                value={stats.totalScans}
                variant="default"
              />
              <StatusIndicator
                label="Opportunities"
                value={stats.opportunitiesFound}
                variant="default"
              />
              <StatusIndicator
                label="Alerts Sent"
                value={stats.alertsSent}
                variant="default"
              />
              <StatusIndicator
                label="API Calls"
                value={stats.apiCallsToday}
                variant="default"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Overview and Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Market Overview */}
        <Card>
          <CardHeader icon="📈">Market Overview</CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatusIndicator
                label="Sentiment"
                value={overview.marketSentiment}
                variant={sentimentColor}
                glow
              />
              <StatusIndicator
                label="Bullish"
                value={overview.bullishSignals}
                variant="success"
              />
              <StatusIndicator
                label="Bearish"
                value={overview.bearishSignals}
                variant="danger"
              />
            </div>

            {overview.topSectors.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-300 mb-2">🏭 Active Sectors:</h4>
                <ul className="space-y-1">
                  {overview.topSectors.map((sector) => (
                    <li key={sector.sector} className="text-sm text-gray-400">
                      {sector.sector}: <span className="text-gray-300 font-medium">{sector.signalCount} signals</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Performance Chart */}
        <Card>
          <CardHeader icon="📊">Performance Chart</CardHeader>
          <CardContent>
            <PerformanceChart data={chartData} />
          </CardContent>
        </Card>
      </div>

      {/* Recent Opportunities */}
      <Card className="col-span-full">
        <CardHeader icon="🎯">Recent Opportunities</CardHeader>
        <CardContent>
          {opportunities.length === 0 ? (
            <LoadingCard message="No recent opportunities found" />
          ) : (
            <div className="max-h-[500px] overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-primary-500/40 scrollbar-track-transparent">
              {opportunities.map((opp, index) => (
                <OpportunityCard key={`${opp.symbol}-${index}`} opportunity={opp} index={index} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
