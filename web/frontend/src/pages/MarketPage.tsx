import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusIndicator } from '@/components/ui/StatusIndicator';
import { LoadingCard, EmptyState } from '@/components/ui/LoadingSpinner';
import { api } from '@/services/api';
import type { MarketOverview } from '@/types/trading';
import {
  Globe,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Building2,
  BarChart3,
  Activity,
  Minus,
} from 'lucide-react';

export function MarketPage() {
  const [loading, setLoading] = useState(false);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [initialLoad, setInitialLoad] = useState(true);

  const handleRefresh = async (showToast = true) => {
    setLoading(true);
    try {
      const data = await api.getMarketOverview();
      setOverview(data);
      if (showToast) {
        toast.success('Market data refreshed successfully');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to refresh market data: ${message}`);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  // Auto-fetch market data on mount
  useEffect(() => {
    handleRefresh(false);
  }, []);

  const sentimentColor = overview?.marketSentiment === 'BULLISH' ? 'success' : overview?.marketSentiment === 'BEARISH' ? 'danger' : 'warning';
  const SentimentIcon = overview?.marketSentiment === 'BULLISH' ? TrendingUp : overview?.marketSentiment === 'BEARISH' ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="tabpanel"
      id="panel-market"
      aria-labelledby="tab-market"
    >
      <Card>
        <CardHeader icon={<Globe className="w-5 h-5" />}>Market Sentiment</CardHeader>
        <CardContent>
          <div className="mb-6">
            <Button
              variant="primary"
              onClick={() => handleRefresh(true)}
              loading={loading}
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Refresh Market Data
            </Button>
          </div>

          {loading && initialLoad ? (
            <LoadingCard message="Analyzing market sentiment..." />
          ) : !overview ? (
            <EmptyState
              variant="opportunities"
              title="No Market Data"
              description="Click Refresh to get the latest market sentiment analysis and sector breakdowns."
              action={
                <Button variant="primary" size="sm" onClick={() => handleRefresh(true)}>
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                  Refresh Now
                </Button>
              }
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Sentiment Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
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
                <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-6 border border-dark-border">
                  <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                    <Building2 className="w-5 h-5 text-primary-400" aria-hidden="true" />
                    Active Sectors
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
                        <span className="text-dark-text-secondary font-medium">{sector.sector}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-dark-text-tertiary">{sector.signalCount} signals</span>
                          <div
                            className="w-24 sm:w-32 h-2 bg-dark-bg rounded-full overflow-hidden"
                            role="img"
                            aria-label={`${sector.sector}: ${sector.signalCount} signals`}
                          >
                            <div
                              className="h-full bg-gradient-to-r from-primary-500 to-success-500 transition-all duration-500"
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
              <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-6 border border-dark-border">
                <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                  <BarChart3 className="w-5 h-5 text-primary-400" aria-hidden="true" />
                  Market Summary
                </h4>
                <div className="space-y-3 text-sm">
                  <p className="flex items-start gap-2 text-dark-text-tertiary">
                    <Activity className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>
                      The current market sentiment is{' '}
                      <span className={`font-bold ${sentimentColor === 'success' ? 'text-success-400' : sentimentColor === 'danger' ? 'text-danger-400' : 'text-warning-400'}`}>
                        {overview.marketSentiment}
                      </span>
                      {' '}based on analysis of{' '}
                      <span className="text-primary-400 font-medium">{overview.successfullyAnalyzed || overview.totalAnalyzed}</span>
                      {' '}of {overview.totalAnalyzed} stocks.
                    </span>
                  </p>
                  <p className="flex items-start gap-2 text-dark-text-tertiary">
                    <SentimentIcon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>
                      There are <span className="text-success-400 font-medium">{overview.bullishSignals} bullish</span> signals
                      and <span className="text-danger-400 font-medium">{overview.bearishSignals} bearish</span> signals in the market.
                    </span>
                  </p>
                  {overview.bullishSignals > overview.bearishSignals ? (
                    <p className="flex items-center gap-2 text-success-400 mt-4 p-3 bg-success-500/10 rounded-lg border border-success-500/20">
                      <TrendingUp className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                      The market shows positive momentum with more bullish signals than bearish.
                    </p>
                  ) : overview.bearishSignals > overview.bullishSignals ? (
                    <p className="flex items-center gap-2 text-danger-400 mt-4 p-3 bg-danger-500/10 rounded-lg border border-danger-500/20">
                      <TrendingDown className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                      The market shows negative momentum with more bearish signals than bullish.
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-warning-400 mt-4 p-3 bg-warning-500/10 rounded-lg border border-warning-500/20">
                      <Minus className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                      The market is balanced with equal bullish and bearish signals.
                    </p>
                  )}
                </div>
              </div>

              {/* Analyzed Stocks Detail */}
              <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-6 border border-dark-border">
                <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                  <Activity className="w-5 h-5 text-primary-400" aria-hidden="true" />
                  Stocks Analyzed
                </h4>
                <p className="text-xs text-dark-text-muted mb-3">
                  Top 20 S&P 500 stocks by market cap are used to gauge overall market sentiment.
                </p>
                {overview.analyzedSymbols && overview.analyzedSymbols.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-dark-text-tertiary mb-2">
                      Successfully analyzed ({overview.analyzedSymbols.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {overview.analyzedSymbols.map((symbol) => (
                        <span
                          key={symbol}
                          className="px-2 py-0.5 text-xs bg-success-500/10 text-success-400 rounded border border-success-500/20"
                        >
                          {symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {overview.skippedSymbols && overview.skippedSymbols.length > 0 && (
                  <div>
                    <p className="text-xs text-dark-text-tertiary mb-2">
                      Skipped due to rate limits or errors ({overview.skippedSymbols.length}):
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {overview.skippedSymbols.map((symbol) => (
                        <span
                          key={symbol}
                          className="px-2 py-0.5 text-xs bg-warning-500/10 text-warning-400 rounded border border-warning-500/20"
                        >
                          {symbol}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
