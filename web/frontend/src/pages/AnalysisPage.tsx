import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingCard, EmptyState } from '@/components/ui/LoadingSpinner';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/services/api';
import { formatCurrency, formatPercentage, formatVolume } from '@/utils/formatters';
import type { AnalysisResult, TechnicalIndicatorData } from '@/types/trading';
import {
  LineChart,
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  Target,
  Shield,
  Activity,
  Lightbulb,
  Gauge,
  Layers,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';

// Indicator gauge component
function IndicatorGauge({ label, value, min, max, thresholds }: {
  label: string;
  value: number;
  min: number;
  max: number;
  thresholds?: { low: number; high: number };
}) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  let color = 'bg-primary-500';
  let textColor = 'text-dark-text-primary';

  if (thresholds) {
    if (value <= thresholds.low) {
      color = 'bg-success-500';
      textColor = 'text-success-400';
    } else if (value >= thresholds.high) {
      color = 'bg-danger-500';
      textColor = 'text-danger-400';
    } else {
      color = 'bg-warning-500';
      textColor = 'text-warning-400';
    }
  }

  return (
    <div className="p-3 bg-dark-bg/60 rounded-lg border border-dark-border">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs text-dark-text-tertiary">{label}</span>
        <span className={`text-sm font-bold ${textColor}`}>{value.toFixed(1)}</span>
      </div>
      <div className="h-2 bg-dark-surface rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-dark-text-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// Signal list component
function SignalList({ signals, variant }: { signals: string[]; variant: 'bullish' | 'bearish' | 'neutral' }) {
  if (signals.length === 0) return null;

  const config = {
    bullish: { icon: CheckCircle, color: 'text-success-400', bg: 'bg-success-500/10', border: 'border-success-500/20' },
    bearish: { icon: XCircle, color: 'text-danger-400', bg: 'bg-danger-500/10', border: 'border-danger-500/20' },
    neutral: { icon: AlertTriangle, color: 'text-warning-400', bg: 'bg-warning-500/10', border: 'border-warning-500/20' },
  }[variant];

  const Icon = config.icon;

  return (
    <div className={`p-3 rounded-lg ${config.bg} border ${config.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${config.color}`} />
        <span className={`text-sm font-medium ${config.color} capitalize`}>{variant} Signals</span>
      </div>
      <ul className="space-y-1">
        {signals.map((signal, index) => (
          <li key={index} className="text-xs text-dark-text-tertiary flex items-start gap-2">
            <span className="mt-1">•</span>
            <span>{signal}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AnalysisPage() {
  const { symbol: urlSymbol } = useParams<{ symbol?: string }>();
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState(urlSymbol || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [indicators, setIndicators] = useState<TechnicalIndicatorData | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-analyze if symbol is in URL
  useEffect(() => {
    if (urlSymbol && urlSymbol !== symbol) {
      setSymbol(urlSymbol);
      handleAnalyzeSymbol(urlSymbol);
    }
  }, [urlSymbol]);

  const handleAnalyzeSymbol = async (targetSymbol: string) => {
    const trimmedSymbol = targetSymbol.trim().toUpperCase();
    if (!trimmedSymbol) {
      toast.error('Please enter a stock symbol');
      return;
    }

    setLoading(true);
    setIndicators(null);
    try {
      // Fetch both basic analysis and full indicators in parallel
      const [analysisData, indicatorData] = await Promise.all([
        api.analyzeStock(trimmedSymbol),
        api.getIndicators(trimmedSymbol).catch(() => null), // Don't fail if indicators unavailable
      ]);
      setResult(analysisData);
      setIndicators(indicatorData);
      toast.success(`Analysis complete for ${trimmedSymbol}`);
      // Update URL without triggering re-render
      if (trimmedSymbol !== urlSymbol) {
        navigate(`/analysis/${trimmedSymbol}`, { replace: true });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Analysis failed: ${message}`);
      setResult(null);
      setIndicators(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => handleAnalyzeSymbol(symbol);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAnalyze();
    }
  };

  const ChangeIcon = result?.quote.change && result.quote.change >= 0 ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="tabpanel"
      id="panel-analysis"
      aria-labelledby="tab-analysis"
    >
      <Card>
        <CardHeader icon={<LineChart className="w-5 h-5" />}>Stock Analysis</CardHeader>
        <CardContent>
          {/* Input Form */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-text-muted" aria-hidden="true" />
              <Input
                id="stock-symbol"
                name="symbol"
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter symbol (e.g., AAPL)"
                className="pl-10 w-full"
                aria-label="Stock symbol"
              />
            </div>
            <Button
              variant="primary"
              onClick={handleAnalyze}
              loading={loading}
              disabled={loading || !symbol.trim()}
            >
              <Activity className="w-4 h-4" aria-hidden="true" />
              Analyze
            </Button>
          </div>

          {/* Results */}
          {loading ? (
            <LoadingCard message={`Analyzing ${symbol.toUpperCase()}...`} />
          ) : !result ? (
            <EmptyState
              variant="search"
              title="Enter a Stock Symbol"
              description="Type a stock symbol above and click Analyze to get detailed trading signals and technical analysis."
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Symbol Header */}
              <div className="flex items-center justify-between pb-4 border-b border-dark-border">
                <h3 className="text-xl sm:text-2xl font-bold text-dark-text-primary">{result.symbol}</h3>
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-dark-bg/60 rounded-lg p-3 sm:p-4 border border-dark-border">
                  <div className="flex items-center gap-1 text-xs text-dark-text-tertiary mb-1">
                    <DollarSign className="w-3 h-3" aria-hidden="true" />
                    Current Price
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-dark-text-primary">{formatCurrency(result.quote.price)}</div>
                </div>
                <div className="bg-dark-bg/60 rounded-lg p-3 sm:p-4 border border-dark-border">
                  <div className="flex items-center gap-1 text-xs text-dark-text-tertiary mb-1">
                    <ChangeIcon className="w-3 h-3" aria-hidden="true" />
                    Change
                  </div>
                  <div className={`text-lg sm:text-xl font-bold ${result.quote.change >= 0 ? 'text-success-500' : 'text-danger-500'}`}>
                    {formatPercentage(result.quote.changePercent)}
                  </div>
                </div>
                <div className="bg-dark-bg/60 rounded-lg p-3 sm:p-4 border border-dark-border">
                  <div className="flex items-center gap-1 text-xs text-dark-text-tertiary mb-1">
                    <BarChart3 className="w-3 h-3" aria-hidden="true" />
                    Volume
                  </div>
                  <div className="text-lg sm:text-xl font-bold text-dark-text-primary">{formatVolume(result.quote.volume)}</div>
                </div>
                <div className="bg-dark-bg/60 rounded-lg p-3 sm:p-4 border border-dark-border">
                  <div className="flex items-center gap-1 text-xs text-dark-text-tertiary mb-1">
                    <Activity className="w-3 h-3" aria-hidden="true" />
                    High / Low
                  </div>
                  <div className="text-sm sm:text-base font-bold text-dark-text-primary">
                    {formatCurrency(result.quote.high)} / {formatCurrency(result.quote.low)}
                  </div>
                </div>
              </div>

              {/* Signal Information */}
              {result.signal && (
                <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                  <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-3">
                    <Target className="w-5 h-5 text-primary-400" aria-hidden="true" />
                    Signal Details
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-dark-text-tertiary">Strategy:</span>
                      <span className="text-dark-text-secondary font-medium">{result.signal.strategy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-dark-text-tertiary">Confidence:</span>
                      <span className="text-warning-400 font-bold">{result.signal.confidence.toFixed(1)}%</span>
                    </div>
                    {result.signal.stopLoss && (
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1 text-dark-text-tertiary">
                          <Shield className="w-3 h-3" aria-hidden="true" />
                          Stop Loss:
                        </span>
                        <span className="text-danger-400 font-medium">{formatCurrency(result.signal.stopLoss)}</span>
                      </div>
                    )}
                    {result.signal.takeProfit && (
                      <div className="flex justify-between">
                        <span className="flex items-center gap-1 text-dark-text-tertiary">
                          <Target className="w-3 h-3" aria-hidden="true" />
                          Take Profit:
                        </span>
                        <span className="text-success-400 font-medium">{formatCurrency(result.signal.takeProfit)}</span>
                      </div>
                    )}
                  </div>
                  {result.signal.reasons.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-dark-border">
                      <h5 className="flex items-center gap-1 text-sm font-semibold text-dark-text-secondary mb-2">
                        <Lightbulb className="w-4 h-4 text-warning-400" aria-hidden="true" />
                        Reasons:
                      </h5>
                      <ul className="list-disc list-inside space-y-1 text-sm text-dark-text-tertiary">
                        {result.signal.reasons.map((reason, index) => (
                          <li key={index}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Technical Indicators Panel */}
              {indicators && (
                <div className="space-y-4">
                  {/* Market Regime */}
                  <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                    <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                      <TrendingUp className="w-5 h-5 text-primary-400" aria-hidden="true" />
                      Market Regime
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                        <p className="text-xs text-dark-text-tertiary mb-1">Regime</p>
                        <p className={`font-bold ${
                          indicators.indicators.marketRegime.type === 'BULLISH_TREND' ? 'text-success-400' :
                          indicators.indicators.marketRegime.type === 'BEARISH_TREND' ? 'text-danger-400' :
                          indicators.indicators.marketRegime.type === 'VOLATILE' ? 'text-warning-400' :
                          'text-dark-text-secondary'
                        }`}>
                          {indicators.indicators.marketRegime.type.replace('_', ' ')}
                        </p>
                      </div>
                      <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                        <p className="text-xs text-dark-text-tertiary mb-1">Strength</p>
                        <p className="font-bold text-dark-text-primary">{indicators.indicators.marketRegime.strength}%</p>
                      </div>
                      <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                        <p className="text-xs text-dark-text-tertiary mb-1">Volatility</p>
                        <p className={`font-bold ${
                          indicators.indicators.marketRegime.volatility === 'HIGH' ? 'text-danger-400' :
                          indicators.indicators.marketRegime.volatility === 'MEDIUM' ? 'text-warning-400' :
                          'text-success-400'
                        }`}>
                          {indicators.indicators.marketRegime.volatility}
                        </p>
                      </div>
                      <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                        <p className="text-xs text-dark-text-tertiary mb-1">Confidence</p>
                        <p className="font-bold text-primary-400">{indicators.indicators.marketRegime.confidence}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Signal Interpretation */}
                  {indicators.interpretation && (
                    <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                      <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                        <Lightbulb className="w-5 h-5 text-warning-400" aria-hidden="true" />
                        Signal Analysis
                      </h4>
                      <div className="grid gap-3 md:grid-cols-3">
                        <SignalList signals={indicators.interpretation.bullishSignals} variant="bullish" />
                        <SignalList signals={indicators.interpretation.bearishSignals} variant="bearish" />
                        <SignalList signals={indicators.interpretation.neutralSignals} variant="neutral" />
                      </div>
                    </div>
                  )}

                  {/* Toggle Advanced Indicators */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full"
                  >
                    <Gauge className="w-4 h-4" />
                    {showAdvanced ? 'Hide' : 'Show'} Advanced Indicators
                  </Button>

                  {/* Advanced Technical Indicators */}
                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4"
                    >
                      {/* Momentum Indicators */}
                      <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                        <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                          <Gauge className="w-5 h-5 text-primary-400" aria-hidden="true" />
                          Momentum Indicators
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <IndicatorGauge
                            label="RSI (14)"
                            value={indicators.indicators.rsi}
                            min={0}
                            max={100}
                            thresholds={{ low: 30, high: 70 }}
                          />
                          <IndicatorGauge
                            label="MFI (14)"
                            value={indicators.indicators.mfi}
                            min={0}
                            max={100}
                            thresholds={{ low: 20, high: 80 }}
                          />
                          <IndicatorGauge
                            label="Stochastic %K"
                            value={indicators.indicators.stochastic.k}
                            min={0}
                            max={100}
                            thresholds={{ low: 20, high: 80 }}
                          />
                          <IndicatorGauge
                            label="Williams %R"
                            value={indicators.indicators.williamsR}
                            min={-100}
                            max={0}
                            thresholds={{ low: -80, high: -20 }}
                          />
                        </div>
                      </div>

                      {/* MACD */}
                      <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                        <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                          <Activity className="w-5 h-5 text-primary-400" aria-hidden="true" />
                          MACD (12, 26, 9)
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">MACD Line</p>
                            <p className={`font-bold ${indicators.indicators.macd.MACD >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                              {indicators.indicators.macd.MACD.toFixed(3)}
                            </p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">Signal Line</p>
                            <p className="font-bold text-dark-text-primary">{indicators.indicators.macd.signal.toFixed(3)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">Histogram</p>
                            <div className="flex items-center gap-2">
                              {indicators.indicators.macd.histogram >= 0 ? (
                                <ArrowUp className="w-4 h-4 text-success-400" />
                              ) : (
                                <ArrowDown className="w-4 h-4 text-danger-400" />
                              )}
                              <span className={`font-bold ${indicators.indicators.macd.histogram >= 0 ? 'text-success-400' : 'text-danger-400'}`}>
                                {indicators.indicators.macd.histogram.toFixed(3)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bollinger Bands */}
                      <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                        <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                          <Layers className="w-5 h-5 text-primary-400" aria-hidden="true" />
                          Bollinger Bands (20, 2)
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">Upper Band</p>
                            <p className="font-bold text-danger-400">{formatCurrency(indicators.indicators.bollingerBands.upper)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">Middle Band (SMA)</p>
                            <p className="font-bold text-primary-400">{formatCurrency(indicators.indicators.bollingerBands.middle)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">Lower Band</p>
                            <p className="font-bold text-success-400">{formatCurrency(indicators.indicators.bollingerBands.lower)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Moving Averages */}
                      <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                        <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                          <LineChart className="w-5 h-5 text-primary-400" aria-hidden="true" />
                          Moving Averages
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">SMA 20</p>
                            <p className="font-bold text-dark-text-primary">{formatCurrency(indicators.indicators.sma.short)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">SMA 50</p>
                            <p className="font-bold text-dark-text-primary">{formatCurrency(indicators.indicators.sma.medium)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">SMA 200</p>
                            <p className="font-bold text-dark-text-primary">{formatCurrency(indicators.indicators.sma.long)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">EMA 12</p>
                            <p className="font-bold text-dark-text-primary">{formatCurrency(indicators.indicators.ema.short)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">EMA 26</p>
                            <p className="font-bold text-dark-text-primary">{formatCurrency(indicators.indicators.ema.long)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Volume & Volatility */}
                      <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                        <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-4">
                          <BarChart3 className="w-5 h-5 text-primary-400" aria-hidden="true" />
                          Volume & Volatility
                        </h4>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">ATR (14)</p>
                            <p className="font-bold text-dark-text-primary">{formatCurrency(indicators.indicators.atr)}</p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">CCI (14)</p>
                            <p className={`font-bold ${
                              indicators.indicators.cci > 100 ? 'text-danger-400' :
                              indicators.indicators.cci < -100 ? 'text-success-400' :
                              'text-dark-text-primary'
                            }`}>
                              {indicators.indicators.cci.toFixed(1)}
                            </p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">Volume Ratio</p>
                            <p className={`font-bold ${
                              indicators.indicators.volumeProfile.volumeRatio > 1.5 ? 'text-success-400' :
                              indicators.indicators.volumeProfile.volumeRatio < 0.7 ? 'text-danger-400' :
                              'text-dark-text-primary'
                            }`}>
                              {indicators.indicators.volumeProfile.volumeRatio.toFixed(2)}x
                            </p>
                          </div>
                          <div className="p-3 bg-dark-surface rounded-lg border border-dark-border">
                            <p className="text-xs text-dark-text-tertiary mb-1">Volume Trend</p>
                            <div className="flex items-center gap-2">
                              {indicators.indicators.volumeProfile.volumeTrend === 'increasing' ? (
                                <ArrowUp className="w-4 h-4 text-success-400" />
                              ) : indicators.indicators.volumeProfile.volumeTrend === 'decreasing' ? (
                                <ArrowDown className="w-4 h-4 text-danger-400" />
                              ) : (
                                <Minus className="w-4 h-4 text-dark-text-muted" />
                              )}
                              <span className="font-bold text-dark-text-primary capitalize">
                                {indicators.indicators.volumeProfile.volumeTrend}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Legacy Indicators fallback */}
              {!indicators && result.indicators && Object.keys(result.indicators).length > 0 && (
                <div className="bg-dark-bg/60 rounded-lg p-4 sm:p-5 border border-dark-border">
                  <h4 className="flex items-center gap-2 text-lg font-semibold text-dark-text-primary mb-3">
                    <BarChart3 className="w-5 h-5 text-primary-400" aria-hidden="true" />
                    Technical Indicators
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {Object.entries(result.indicators).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-dark-text-tertiary">{key}:</span>
                        <span className="text-dark-text-secondary font-medium">{typeof value === 'number' ? value.toFixed(2) : value}</span>
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
