import { motion } from 'framer-motion';
import type { Opportunity } from '@/types/trading';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { TrendingUp, TrendingDown, Minus, Target, Shield, DollarSign } from 'lucide-react';

export interface OpportunityCardProps {
  opportunity: Opportunity;
  index?: number;
}

export function OpportunityCard({ opportunity, index = 0 }: OpportunityCardProps) {
  const { signal, currentPrice, sector, symbol } = opportunity;
  const actionVariant = signal.action === 'BUY' ? 'success' : signal.action === 'SELL' ? 'danger' : 'neutral';
  const borderColor = signal.action === 'BUY' ? 'border-l-success-500' : signal.action === 'SELL' ? 'border-l-danger-500' : 'border-l-primary-500';

  // Calculate risk/reward ratio
  const calculateRiskReward = () => {
    if (!signal.stopLoss || !signal.takeProfit) return null;
    const risk = Math.abs(currentPrice - signal.stopLoss);
    const reward = Math.abs(signal.takeProfit - currentPrice);
    if (risk === 0) return null;
    return (reward / risk).toFixed(2);
  };

  const riskReward = calculateRiskReward();

  // Calculate percentage distances for visual gauge
  const calculateGaugeWidth = () => {
    if (!signal.stopLoss || !signal.takeProfit) return { risk: 50, reward: 50 };
    const risk = Math.abs(currentPrice - signal.stopLoss);
    const reward = Math.abs(signal.takeProfit - currentPrice);
    const total = risk + reward;
    if (total === 0) return { risk: 50, reward: 50 };
    return {
      risk: Math.round((risk / total) * 100),
      reward: Math.round((reward / total) * 100),
    };
  };

  const gauge = calculateGaugeWidth();

  const ActionIcon = signal.action === 'BUY' ? TrendingUp : signal.action === 'SELL' ? TrendingDown : Minus;

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
      className={cn(
        'relative',
        'bg-dark-bg/80 backdrop-blur-md',
        'border border-dark-border border-l-4',
        borderColor,
        'rounded-xl p-4',
        'hover:border-dark-border-hover hover:-translate-y-0.5',
        'hover:shadow-glass',
        'transition-all duration-300',
        'overflow-hidden'
      )}
      aria-label={`${symbol} - ${signal.action} signal with ${signal.confidence.toFixed(0)}% confidence`}
    >
      {/* Background gradient effect on hover */}
      <div
        className={cn(
          'absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none',
          signal.action === 'BUY' ? 'bg-gradient-to-br from-success-500/5 to-success-700/5' :
          signal.action === 'SELL' ? 'bg-gradient-to-br from-danger-500/5 to-danger-700/5' :
          'bg-gradient-to-br from-primary-500/5 to-primary-700/5'
        )}
        aria-hidden="true"
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ActionIcon
              className={cn(
                'w-5 h-5',
                signal.action === 'BUY' ? 'text-success-400' :
                signal.action === 'SELL' ? 'text-danger-400' :
                'text-primary-400'
              )}
              aria-hidden="true"
            />
            <h3 className="text-lg sm:text-xl font-bold text-dark-text-primary">
              {symbol}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={actionVariant} glow>
              {signal.action}
            </Badge>
            <span className="text-base sm:text-lg font-bold text-warning-400">
              {signal.confidence.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="text-sm text-dark-text-tertiary space-y-1.5">
          <div className="flex justify-between">
            <span>Strategy:</span>
            <span className="text-dark-text-secondary font-medium">{signal.strategy}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1">
              <DollarSign className="w-3 h-3" aria-hidden="true" />
              Price:
            </span>
            <span className="text-dark-text-secondary font-medium">{formatCurrency(currentPrice)}</span>
          </div>
          {sector && (
            <div className="flex justify-between">
              <span>Sector:</span>
              <span className="text-dark-text-secondary font-medium">{sector}</span>
            </div>
          )}
        </div>

        {/* Reason */}
        {signal.reasons.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dark-border">
            <p className="text-xs text-dark-text-muted leading-relaxed">
              {signal.reasons[0]}
            </p>
          </div>
        )}

        {/* Risk Management with Visual Gauge */}
        {signal.stopLoss && signal.takeProfit && (
          <div className="mt-3 pt-3 border-t border-dark-border">
            {/* Risk/Reward Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1 text-xs text-dark-text-tertiary">
                <Shield className="w-3 h-3" aria-hidden="true" />
                Risk/Reward
              </span>
              {riskReward && (
                <span className={cn(
                  'text-xs font-bold',
                  parseFloat(riskReward) >= 2 ? 'text-success-400' :
                  parseFloat(riskReward) >= 1 ? 'text-warning-400' :
                  'text-danger-400'
                )}>
                  1:{riskReward}
                </span>
              )}
            </div>

            {/* Visual Risk/Reward Gauge */}
            <div className="relative h-2 bg-dark-bg rounded-full overflow-hidden mb-2" role="img" aria-label={`Risk to reward ratio visualization: ${gauge.risk}% risk, ${gauge.reward}% reward`}>
              <div
                className="absolute left-0 h-full bg-gradient-to-r from-danger-600 to-danger-500"
                style={{ width: `${gauge.risk}%` }}
              />
              <div
                className="absolute right-0 h-full bg-gradient-to-r from-success-500 to-success-600"
                style={{ width: `${gauge.reward}%` }}
              />
              {/* Entry point marker */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-1 h-3 bg-white rounded-full shadow-lg"
                style={{ left: `${gauge.risk}%`, transform: 'translateX(-50%) translateY(-50%)' }}
              />
            </div>

            {/* Price Levels */}
            <div className="flex justify-between text-xs">
              <span className="text-danger-400 font-medium">
                SL: {formatCurrency(signal.stopLoss)}
              </span>
              <span className="text-dark-text-muted">
                Entry: {formatCurrency(currentPrice)}
              </span>
              <span className="text-success-400 font-medium">
                TP: {formatCurrency(signal.takeProfit)}
              </span>
            </div>

            {/* Position Size */}
            {signal.positionSize && (
              <div className="flex items-center justify-center gap-1 mt-2 text-xs text-dark-text-tertiary">
                <Target className="w-3 h-3" aria-hidden="true" />
                <span>Suggested: {signal.positionSize} shares</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}
