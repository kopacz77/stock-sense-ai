#!/bin/bash
# Quick fix script for TypeScript errors
# Run with: bash scripts/fix-typescript-errors.sh

echo "🔧 Fixing TypeScript errors..."

# 1. Add missing exports to backtest-types.ts
echo "📝 Adding missing type exports..."

cat > /tmp/backtest-exports-fix.txt << 'EOF'

// Additional exports for compatibility
export type DrawdownPoint = {
  timestamp: Date;
  equity: number;
  peak: number;
  drawdown: number;
  drawdownPercent: number;
};

export type BarAdjusted = HistoricalDataPoint;

export type Event = MarketDataEvent | SignalEvent | OrderEvent | FillEvent;

export type EventType = 'MARKET_DATA' | 'SIGNAL' | 'ORDER' | 'FILL';

export type OrderSide = 'BUY' | 'SELL';

EOF

# Add exports at the end of backtest-types.ts
cat /tmp/backtest-exports-fix.txt >> src/backtesting/types/backtest-types.ts

echo "✅ Type exports fixed"

# 2. Fix Trade interface to include missing properties
echo "📝 Fixing Trade interface..."

cat > src/backtesting/portfolio/trade-extended.ts << 'EOF'
import type { Trade as BaseTrade } from './trade.js';

export interface TradeExtended extends BaseTrade {
  pnl: number;
  pnlPercent: number;
  holdingPeriod: number;
}

export function extendTrade(trade: BaseTrade, pnl: number, pnlPercent: number, holdingPeriod: number): TradeExtended {
  return {
    ...trade,
    pnl,
    pnlPercent,
    holdingPeriod
  };
}
EOF

echo "✅ Trade interface extended"

# 3. Fix EquityCurvePoint interface
echo "📝 Fixing EquityCurvePoint..."

cat > /tmp/equity-curve-fix.txt << 'EOF'

export interface EquityCurvePointExtended extends EquityCurvePoint {
  date?: Date;
  returns?: number;
  cumulativeReturns?: number;
}
EOF

cat /tmp/equity-curve-fix.txt >> src/backtesting/analytics/equity-curve.ts

echo "✅ EquityCurvePoint fixed"

echo ""
echo "🎯 Quick fixes applied!"
echo "Next steps:"
echo "1. Run: pnpm run build"
echo "2. Fix remaining errors manually"
echo "3. Run tests: pnpm test"
