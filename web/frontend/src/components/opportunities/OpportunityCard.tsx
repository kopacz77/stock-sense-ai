import { motion } from 'framer-motion';
import type { Opportunity } from '@/types/trading';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import { cn } from '@/utils/cn';

export interface OpportunityCardProps {
  opportunity: Opportunity;
  index?: number;
}

export function OpportunityCard({ opportunity, index = 0 }: OpportunityCardProps) {
  const { signal, currentPrice, sector, symbol } = opportunity;
  const actionVariant = signal.action === 'BUY' ? 'success' : signal.action === 'SELL' ? 'danger' : 'neutral';
  const borderColor = signal.action === 'BUY' ? 'border-l-success-500' : signal.action === 'SELL' ? 'border-l-danger-500' : 'border-l-primary-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
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
    >
      {/* Background gradient effect on hover */}
      <div className={cn(
        'absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300',
        signal.action === 'BUY' ? 'bg-gradient-to-br from-success-500/5 to-success-700/5' :
        signal.action === 'SELL' ? 'bg-gradient-to-br from-danger-500/5 to-danger-700/5' :
        'bg-gradient-to-br from-primary-500/5 to-primary-700/5'
      )} />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xl font-bold text-white drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]">
            {symbol}
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant={actionVariant} glow>
              {signal.action}
            </Badge>
            <span className="text-lg font-bold text-warning-500 drop-shadow-[0_0_10px_rgba(245,158,11,0.3)]">
              {signal.confidence.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="text-sm text-gray-400 space-y-1.5">
          <div className="flex justify-between">
            <span>Strategy:</span>
            <span className="text-gray-300 font-medium">{signal.strategy}</span>
          </div>
          <div className="flex justify-between">
            <span>Price:</span>
            <span className="text-gray-300 font-medium">{formatCurrency(currentPrice)}</span>
          </div>
          {sector && (
            <div className="flex justify-between">
              <span>Sector:</span>
              <span className="text-gray-300 font-medium">{sector}</span>
            </div>
          )}
        </div>

        {/* Reason */}
        {signal.reasons.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dark-border">
            <p className="text-xs text-gray-500 italic">
              {signal.reasons[0]}
            </p>
          </div>
        )}

        {/* Risk Management */}
        {signal.stopLoss && (
          <div className="mt-3 pt-3 border-t border-dark-border text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Stop Loss:</span>
              <span className="text-danger-400 font-medium">{formatCurrency(signal.stopLoss)}</span>
            </div>
            {signal.takeProfit && (
              <div className="flex justify-between">
                <span>Take Profit:</span>
                <span className="text-success-400 font-medium">{formatCurrency(signal.takeProfit)}</span>
              </div>
            )}
            {signal.positionSize && (
              <div className="flex justify-between">
                <span>Position Size:</span>
                <span className="text-gray-400 font-medium">{signal.positionSize} shares</span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
