import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingCard } from '@/components/ui/LoadingSpinner';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/services/api';
import { formatCurrency, formatPercentage, formatVolume } from '@/utils/formatters';
import type { AnalysisResult } from '@/types/trading';

export function AnalysisPage() {
  const [symbol, setSymbol] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = async () => {
    const trimmedSymbol = symbol.trim().toUpperCase();
    if (!trimmedSymbol) {
      toast.error('Please enter a stock symbol');
      return;
    }

    setLoading(true);
    try {
      const data = await api.analyzeStock(trimmedSymbol);
      setResult(data);
      toast.success(`Analysis complete for ${trimmedSymbol}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Analysis failed: ${message}`);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Card>
        <CardHeader icon="📈">Stock Analysis</CardHeader>
        <CardContent>
          {/* Input Form */}
          <div className="flex gap-3 mb-6">
            <Input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter symbol (e.g., AAPL)"
              className="flex-1"
            />
            <Button
              variant="primary"
              onClick={handleAnalyze}
              loading={loading}
            >
              Analyze
            </Button>
          </div>

          {/* Results */}
          {loading ? (
            <LoadingCard message={`📈 Analyzing ${symbol.toUpperCase()}...`} />
          ) : !result ? (
            <div className="text-center py-12 text-gray-400 italic">
              Enter a stock symbol and click Analyze
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Symbol Header */}
              <div className="flex items-center justify-between pb-4 border-b border-dark-border">
                <h3 className="text-2xl font-bold text-white">{result.symbol}</h3>
                {result.signal && (
                  <Badge
                    variant={result.signal.action === 'BUY' ? 'success' : result.signal.action === 'SELL' ? 'danger' : 'neutral'}
                    glow
                  >
                    {result.signal.action}
                  </Badge>
                )}
              </div>

              {/* Price Information */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-dark-bg/60 rounded-lg p-4 border border-dark-border">
                  <div className="text-xs text-gray-400 mb-1">Current Price</div>
                  <div className="text-xl font-bold text-white">{formatCurrency(result.quote.price)}</div>
                </div>
                <div className="bg-dark-bg/60 rounded-lg p-4 border border-dark-border">
                  <div className="text-xs text-gray-400 mb-1">Change</div>
                  <div className={`text-xl font-bold ${result.quote.change >= 0 ? 'text-success-500' : 'text-danger-500'}`}>
                    {formatPercentage(result.quote.changePercent)}
                  </div>
                </div>
                <div className="bg-dark-bg/60 rounded-lg p-4 border border-dark-border">
                  <div className="text-xs text-gray-400 mb-1">Volume</div>
                  <div className="text-xl font-bold text-white">{formatVolume(result.quote.volume)}</div>
                </div>
                <div className="bg-dark-bg/60 rounded-lg p-4 border border-dark-border">
                  <div className="text-xs text-gray-400 mb-1">High / Low</div>
                  <div className="text-sm font-bold text-white">
                    {formatCurrency(result.quote.high)} / {formatCurrency(result.quote.low)}
                  </div>
                </div>
              </div>

              {/* Signal Information */}
              {result.signal && (
                <div className="bg-dark-bg/60 rounded-lg p-4 border border-dark-border">
                  <h4 className="text-lg font-semibold text-white mb-3">Signal Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Strategy:</span>
                      <span className="text-gray-300 font-medium">{result.signal.strategy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Confidence:</span>
                      <span className="text-warning-500 font-bold">{result.signal.confidence.toFixed(1)}%</span>
                    </div>
                    {result.signal.stopLoss && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Stop Loss:</span>
                        <span className="text-danger-400 font-medium">{formatCurrency(result.signal.stopLoss)}</span>
                      </div>
                    )}
                    {result.signal.takeProfit && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Take Profit:</span>
                        <span className="text-success-400 font-medium">{formatCurrency(result.signal.takeProfit)}</span>
                      </div>
                    )}
                  </div>
                  {result.signal.reasons.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-dark-border">
                      <h5 className="text-sm font-semibold text-gray-300 mb-2">Reasons:</h5>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
                        {result.signal.reasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Indicators */}
              {result.indicators && Object.keys(result.indicators).length > 0 && (
                <div className="bg-dark-bg/60 rounded-lg p-4 border border-dark-border">
                  <h4 className="text-lg font-semibold text-white mb-3">Technical Indicators</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {Object.entries(result.indicators).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-400">{key}:</span>
                        <span className="text-gray-300 font-medium">{typeof value === 'number' ? value.toFixed(2) : value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
