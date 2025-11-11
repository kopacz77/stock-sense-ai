import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { LoadingCard } from '@/components/ui/LoadingSpinner';
import { api } from '@/services/api';
import type { MarketOverview } from '@/types/trading';

export function MarketPage() {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<MarketOverview | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await api.getMarketOverview();
      setOverview(data);
      toast.success('Market data refreshed successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to refresh market data: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const sentimentColor = overview?.marketSentiment === 'BULLISH' ? 'success' : overview?.marketSentiment === 'BEARISH' ? 'danger' : 'warning';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Card>
        <CardHeader icon="🌍">Market Sentiment</CardHeader>
        <CardContent>
          <div className="mb-6">
            <Button
              variant="primary"
              onClick={handleRefresh}
              loading={loading}
            >
              Refresh Market Data
            </Button>
          </div>

          {loading ? (
            <LoadingCard message="📊 Analyzing market sentiment..." />
          ) : !overview ? (
            <div className="text-center py-12 text-gray-400 italic">
              Click Refresh to get market sentiment
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Sentiment Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatusIndicator
                  label="Overall Sentiment"
                  value={overview.marketSentiment}
                  variant={sentimentColor}
                  glow
                />
                <StatusIndicator
                  label="Bullish Signals"
                  value={overview.bullishSignals}
                  variant="success"
                />
                <StatusIndicator
                  label="Bearish Signals"
                  value={overview.bearishSignals}
                  variant="danger"
                />
                <StatusIndicator
                  label="Stocks Analyzed"
                  value={overview.totalAnalyzed}
                  variant="default"
                />
              </div>

              {/* Top Sectors */}
              {overview.topSectors.length > 0 && (
                <div className="bg-dark-bg/60 rounded-lg p-6 border border-dark-border">
                  <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <span>🏭</span>
                    <span>Active Sectors</span>
                  </h4>
                  <div className="space-y-3">
                    {overview.topSectors.map((sector, index) => (
                      <motion.div
                        key={sector.sector}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-center justify-between p-3 bg-dark-surface rounded-lg border border-dark-border hover:border-dark-border-hover transition-all"
                      >
                        <span className="text-gray-300 font-medium">{sector.sector}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-400">{sector.signalCount} signals</span>
                          <div className="w-32 h-2 bg-dark-bg rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-primary-500 to-success-500"
                              style={{
                                width: `${Math.min((sector.signalCount / Math.max(...overview.topSectors.map(s => s.signalCount))) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Market Summary */}
              <div className="bg-dark-bg/60 rounded-lg p-6 border border-dark-border">
                <h4 className="text-lg font-semibold text-white mb-4">Market Summary</h4>
                <div className="space-y-2 text-sm">
                  <p className="text-gray-400">
                    The current market sentiment is{' '}
                    <span className={`font-bold ${sentimentColor === 'success' ? 'text-success-500' : sentimentColor === 'danger' ? 'text-danger-500' : 'text-warning-500'}`}>
                      {overview.marketSentiment}
                    </span>
                    {' '}based on analysis of {overview.totalAnalyzed} stocks.
                  </p>
                  <p className="text-gray-400">
                    There are {overview.bullishSignals} bullish signals and {overview.bearishSignals} bearish signals in the market.
                  </p>
                  {overview.bullishSignals > overview.bearishSignals ? (
                    <p className="text-success-400 mt-3">
                      The market shows positive momentum with more bullish signals than bearish.
                    </p>
                  ) : overview.bearishSignals > overview.bullishSignals ? (
                    <p className="text-danger-400 mt-3">
                      The market shows negative momentum with more bearish signals than bullish.
                    </p>
                  ) : (
                    <p className="text-warning-400 mt-3">
                      The market is balanced with equal bullish and bearish signals.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
