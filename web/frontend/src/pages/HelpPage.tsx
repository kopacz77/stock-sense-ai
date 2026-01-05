import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  HelpCircle,
  Activity,
  Compass,
  LineChart,
  Globe,
  Keyboard,
  PlayCircle,
  StopCircle,
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BookOpen,
  Gauge,
  Shield,
  BarChart3,
  Layers,
  Target,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// Feature sections for app navigation
const sections = [
  {
    title: 'Monitoring',
    icon: Activity,
    description: 'Real-time stock monitoring and opportunity detection',
    features: [
      {
        icon: PlayCircle,
        title: 'Start Monitoring',
        description: 'Configure symbols and intervals, then click Start to begin scanning for trading opportunities.',
      },
      {
        icon: StopCircle,
        title: 'Stop Monitoring',
        description: 'Click Stop to pause the monitoring service. Your settings are preserved.',
      },
      {
        icon: TrendingUp,
        title: 'Opportunity Cards',
        description: 'When opportunities are found, they appear as cards showing signal type, confidence level, and risk metrics.',
      },
    ],
  },
  {
    title: 'Discovery',
    icon: Compass,
    description: 'Scan markets to discover new trading opportunities',
    features: [
      {
        icon: Search,
        title: 'Configure Scan',
        description: 'Set minimum confidence threshold (0-100%) and maximum stocks to analyze.',
      },
      {
        icon: PlayCircle,
        title: 'Run Discovery',
        description: 'Click Discover to scan the market. Results show stocks with the strongest signals.',
      },
      {
        icon: CheckCircle,
        title: 'Review Results',
        description: 'Click on any discovered stock to navigate to the Analysis page for detailed breakdown.',
      },
    ],
  },
  {
    title: 'Analysis',
    icon: LineChart,
    description: 'In-depth technical analysis of individual stocks',
    features: [
      {
        icon: Search,
        title: 'Enter Symbol',
        description: 'Type a stock ticker (e.g., AAPL, TSLA, MSFT) and click Analyze.',
      },
      {
        icon: TrendingUp,
        title: 'Technical Indicators',
        description: 'View RSI, MACD, moving averages, and other indicators with their current signals.',
      },
      {
        icon: AlertTriangle,
        title: 'Risk Assessment',
        description: 'Check VaR (Value at Risk) and volatility metrics before making decisions.',
      },
    ],
  },
  {
    title: 'Market',
    icon: Globe,
    description: 'Overall market sentiment and sector analysis',
    features: [
      {
        icon: RefreshCw,
        title: 'Refresh Data',
        description: 'Click Refresh to get the latest market sentiment analysis.',
      },
      {
        icon: TrendingUp,
        title: 'Sentiment Overview',
        description: 'See bullish vs bearish signal counts across all analyzed stocks.',
      },
      {
        icon: Activity,
        title: 'Sector Breakdown',
        description: 'View which sectors are showing the most trading activity.',
      },
    ],
  },
];

const shortcuts = [
  { keys: ['Ctrl', '1'], description: 'Switch to Monitoring tab' },
  { keys: ['Ctrl', '2'], description: 'Switch to Discovery tab' },
  { keys: ['Ctrl', '3'], description: 'Switch to Analysis tab' },
  { keys: ['Ctrl', '4'], description: 'Switch to Market tab' },
  { keys: ['Ctrl', '5'], description: 'Switch to Settings tab' },
  { keys: ['Ctrl', '6'], description: 'Switch to Help tab' },
  { keys: ['<', '>'], description: 'Navigate between tabs (when focused)' },
];

// Comprehensive indicator definitions
const momentumIndicators = [
  {
    name: 'RSI (Relative Strength Index)',
    period: '14 periods',
    range: '0 to 100',
    description: 'Measures the speed and magnitude of recent price changes to evaluate overbought or oversold conditions. It compares the average gains to average losses over the period.',
    calculation: 'RSI = 100 - (100 / (1 + RS)), where RS = Average Gain / Average Loss',
    interpretation: [
      { condition: 'RSI < 30', signal: 'Oversold', action: 'Bullish - potential buying opportunity', color: 'text-success-400' },
      { condition: 'RSI > 70', signal: 'Overbought', action: 'Bearish - potential selling opportunity', color: 'text-danger-400' },
      { condition: '30 < RSI < 70', signal: 'Neutral', action: 'No extreme condition', color: 'text-dark-text-secondary' },
    ],
    proTip: 'RSI divergence (price makes new high but RSI doesn\'t) can signal trend reversal.',
  },
  {
    name: 'MFI (Money Flow Index)',
    period: '14 periods',
    range: '0 to 100',
    description: 'Volume-weighted RSI that incorporates both price and volume data. It measures buying and selling pressure by analyzing price changes along with volume.',
    calculation: 'Uses typical price ((high + low + close) / 3) multiplied by volume to calculate money flow',
    interpretation: [
      { condition: 'MFI < 20', signal: 'Oversold', action: 'Potential accumulation phase', color: 'text-success-400' },
      { condition: 'MFI > 80', signal: 'Overbought', action: 'Potential distribution phase', color: 'text-danger-400' },
      { condition: '20 < MFI < 80', signal: 'Neutral', action: 'Normal trading range', color: 'text-dark-text-secondary' },
    ],
    proTip: 'MFI divergence from price is often more reliable than RSI because it includes volume.',
  },
  {
    name: 'Stochastic Oscillator',
    period: '%K: 14, %D: 3',
    range: '0 to 100',
    description: 'Compares a stock\'s closing price to its price range over a given period. The theory is that in uptrends, prices close near the high, and in downtrends, prices close near the low.',
    calculation: '%K = (Current Close - Lowest Low) / (Highest High - Lowest Low) x 100; %D = 3-period SMA of %K',
    interpretation: [
      { condition: '%K < 20', signal: 'Oversold', action: 'Look for bullish crossover of %K above %D', color: 'text-success-400' },
      { condition: '%K > 80', signal: 'Overbought', action: 'Look for bearish crossover of %K below %D', color: 'text-danger-400' },
      { condition: '%K crosses above %D', signal: 'Bullish', action: 'Momentum turning positive', color: 'text-success-400' },
    ],
    proTip: 'Best used in ranging markets. In strong trends, can stay overbought/oversold for extended periods.',
  },
  {
    name: 'Williams %R',
    period: '14 periods',
    range: '-100 to 0',
    description: 'Similar to stochastic oscillator but inverted. Measures the level of the close relative to the highest high over the lookback period.',
    calculation: '%R = (Highest High - Close) / (Highest High - Lowest Low) x -100',
    interpretation: [
      { condition: '%R < -80', signal: 'Oversold', action: 'Potential bullish reversal zone', color: 'text-success-400' },
      { condition: '%R > -20', signal: 'Overbought', action: 'Potential bearish reversal zone', color: 'text-danger-400' },
      { condition: '-80 < %R < -20', signal: 'Neutral', action: 'Price in middle of range', color: 'text-dark-text-secondary' },
    ],
    proTip: 'Williams %R is essentially the inverse of the fast stochastic %K.',
  },
  {
    name: 'CCI (Commodity Channel Index)',
    period: '14 periods',
    range: 'Unbounded (typically -200 to +200)',
    description: 'Measures the current price level relative to an average price level over a given period. High values indicate price is unusually high compared to average.',
    calculation: 'CCI = (Typical Price - SMA) / (0.015 x Mean Deviation)',
    interpretation: [
      { condition: 'CCI > +100', signal: 'Strong uptrend', action: 'Overbought but trending higher', color: 'text-success-400' },
      { condition: 'CCI < -100', signal: 'Strong downtrend', action: 'Oversold but trending lower', color: 'text-danger-400' },
      { condition: '-100 < CCI < +100', signal: 'Neutral', action: 'Price near average levels', color: 'text-dark-text-secondary' },
    ],
    proTip: 'CCI crossing above +100 or below -100 can signal the start of a strong trend.',
  },
];

const trendIndicators = [
  {
    name: 'MACD (Moving Average Convergence Divergence)',
    period: 'Fast: 12, Slow: 26, Signal: 9',
    range: 'Unbounded (oscillates around zero)',
    description: 'Shows the relationship between two moving averages. It reveals changes in strength, direction, momentum, and duration of a trend.',
    calculation: 'MACD Line = 12-EMA - 26-EMA; Signal Line = 9-EMA of MACD; Histogram = MACD - Signal',
    interpretation: [
      { condition: 'MACD > Signal & Histogram > 0', signal: 'Bullish', action: 'Upward momentum confirmed', color: 'text-success-400' },
      { condition: 'MACD < Signal & Histogram < 0', signal: 'Bearish', action: 'Downward momentum confirmed', color: 'text-danger-400' },
      { condition: 'Histogram changing sign', signal: 'Crossover', action: 'Potential trend change', color: 'text-warning-400' },
    ],
    proTip: 'MACD histogram peaks/troughs often precede price peaks/troughs.',
  },
  {
    name: 'Simple Moving Averages (SMA)',
    period: 'Short: 20, Medium: 50, Long: 200',
    range: 'Price levels',
    description: 'Smooths price data to identify trend direction. The 200-day SMA is widely watched as a major support/resistance and trend indicator.',
    calculation: 'SMA = Sum of closing prices over n periods / n',
    interpretation: [
      { condition: 'Price > SMA 200', signal: 'Bullish', action: 'Long-term uptrend', color: 'text-success-400' },
      { condition: 'Price < SMA 200', signal: 'Bearish', action: 'Long-term downtrend', color: 'text-danger-400' },
      { condition: 'SMA 20 > SMA 50 > SMA 200', signal: 'Strong bullish', action: 'All timeframes aligned up', color: 'text-success-400' },
      { condition: 'SMA 20 < SMA 50 < SMA 200', signal: 'Strong bearish', action: 'All timeframes aligned down', color: 'text-danger-400' },
    ],
    proTip: '"Golden Cross" (50 SMA crossing above 200 SMA) is a classic bullish signal; "Death Cross" is the opposite.',
  },
  {
    name: 'Exponential Moving Averages (EMA)',
    period: 'Short: 12, Long: 26',
    range: 'Price levels',
    description: 'Like SMA but gives more weight to recent prices, making it more responsive to new information. Used in MACD calculation.',
    calculation: 'EMA = Price(today) x k + EMA(yesterday) x (1-k), where k = 2/(n+1)',
    interpretation: [
      { condition: 'Price > EMA', signal: 'Bullish', action: 'Short-term upward momentum', color: 'text-success-400' },
      { condition: 'Price < EMA', signal: 'Bearish', action: 'Short-term downward momentum', color: 'text-danger-400' },
      { condition: 'EMA 12 > EMA 26', signal: 'Bullish', action: 'Short-term trend is up', color: 'text-success-400' },
    ],
    proTip: 'EMAs react faster than SMAs, making them better for short-term trading but more prone to false signals.',
  },
];

const volatilityIndicators = [
  {
    name: 'Bollinger Bands',
    period: '20 periods, 2 standard deviations',
    range: 'Price levels (bands around SMA)',
    description: 'Consists of a middle band (SMA) with upper and lower bands based on standard deviation. Bands widen during volatility and narrow during calm periods.',
    calculation: 'Upper = SMA + (2 x StdDev); Middle = 20-SMA; Lower = SMA - (2 x StdDev)',
    interpretation: [
      { condition: 'Price touches lower band', signal: 'Oversold', action: 'Potential bounce opportunity', color: 'text-success-400' },
      { condition: 'Price touches upper band', signal: 'Overbought', action: 'Potential pullback ahead', color: 'text-danger-400' },
      { condition: 'Band squeeze (narrow)', signal: 'Low volatility', action: 'Breakout likely coming', color: 'text-warning-400' },
      { condition: 'Band expansion', signal: 'High volatility', action: 'Trend in progress', color: 'text-primary-400' },
    ],
    proTip: 'The "squeeze" (when bands narrow significantly) often precedes major price moves.',
  },
  {
    name: 'ATR (Average True Range)',
    period: '14 periods',
    range: 'Positive values (in price terms)',
    description: 'Measures market volatility by decomposing the entire range of a stock price for that period. Not directional, just measures volatility.',
    calculation: 'True Range = Max of (High-Low, |High-Previous Close|, |Low-Previous Close|); ATR = 14-period average of TR',
    interpretation: [
      { condition: 'ATR < 2% of price', signal: 'Low volatility', action: 'Smaller position sizes may work', color: 'text-success-400' },
      { condition: 'ATR > 5% of price', signal: 'High volatility', action: 'Use wider stops, smaller positions', color: 'text-danger-400' },
      { condition: 'ATR increasing', signal: 'Volatility rising', action: 'Be cautious, manage risk', color: 'text-warning-400' },
    ],
    proTip: 'Use ATR for stop loss placement: Stop = Entry Price +/- (ATR x 2) is a common formula.',
  },
];

const volumeIndicators = [
  {
    name: 'Volume Ratio',
    period: '20-period average',
    range: '0 to infinity (1.0 = average)',
    description: 'Compares current volume to the 20-period average volume. Shows whether current trading activity is above or below normal.',
    calculation: 'Volume Ratio = Current Volume / 20-period Average Volume',
    interpretation: [
      { condition: 'Ratio > 1.5', signal: 'High volume', action: 'Strong conviction in price move', color: 'text-success-400' },
      { condition: 'Ratio < 0.7', signal: 'Low volume', action: 'Weak conviction, be cautious', color: 'text-warning-400' },
      { condition: 'Ratio near 1.0', signal: 'Normal', action: 'Average trading activity', color: 'text-dark-text-secondary' },
    ],
    proTip: 'Price moves on high volume are more reliable than moves on low volume.',
  },
  {
    name: 'Volume Trend',
    period: '20 periods (10 vs 10 comparison)',
    range: 'Increasing, Decreasing, or Stable',
    description: 'Compares average volume of the first 10 periods to the last 10 periods to determine if volume is trending up or down.',
    calculation: 'Compares mean of periods 1-10 vs mean of periods 11-20; >10% change required',
    interpretation: [
      { condition: 'Increasing + Price up', signal: 'Bullish', action: 'Trend has strong support', color: 'text-success-400' },
      { condition: 'Decreasing + Price up', signal: 'Warning', action: 'Rally may be weakening', color: 'text-warning-400' },
      { condition: 'Increasing + Price down', signal: 'Bearish', action: 'Selling pressure intensifying', color: 'text-danger-400' },
    ],
    proTip: 'Volume should confirm price: rising prices should have rising volume for a healthy trend.',
  },
];

const marketRegimeInfo = {
  title: 'Market Regime Detection',
  description: 'The system analyzes multiple factors to classify the current market environment into one of four regimes:',
  regimes: [
    {
      type: 'BULLISH TREND',
      color: 'text-success-400',
      bgColor: 'bg-success-500/10',
      description: 'Strong upward momentum with aligned moving averages',
      conditions: [
        'SMA 20 > SMA 50 > SMA 200 (bullish alignment)',
        'Price is above the average of SMAs',
        'Trend strength > 30%',
      ],
      trading: 'Focus on long positions, buy dips, trail stops',
    },
    {
      type: 'BEARISH TREND',
      color: 'text-danger-400',
      bgColor: 'bg-danger-500/10',
      description: 'Strong downward momentum with aligned moving averages',
      conditions: [
        'SMA 20 < SMA 50 < SMA 200 (bearish alignment)',
        'Price is below the average of SMAs',
        'Trend strength > 30%',
      ],
      trading: 'Focus on short positions or stay in cash, sell rallies',
    },
    {
      type: 'SIDEWAYS',
      color: 'text-dark-text-secondary',
      bgColor: 'bg-dark-surface',
      description: 'Low momentum, price consolidating without clear direction',
      conditions: [
        'Trend strength < 30%',
        'No clear SMA alignment',
        'Price oscillating around SMAs',
      ],
      trading: 'Range trading strategies, buy support, sell resistance',
    },
    {
      type: 'VOLATILE',
      color: 'text-warning-400',
      bgColor: 'bg-warning-500/10',
      description: 'High volatility without clear trend direction',
      conditions: [
        'ATR > 5% of price OR Bollinger Bands width > 20%',
        'Trend strength < 40%',
        'Large price swings in both directions',
      ],
      trading: 'Reduce position sizes, use wider stops, consider staying out',
    },
  ],
  metrics: [
    { name: 'Strength', description: '0-100% indicating how strong the current regime is' },
    { name: 'Volatility', description: 'LOW (<2% ATR), MEDIUM, or HIGH (>5% ATR)' },
    { name: 'Confidence', description: '0-100% indicating how reliable the regime classification is' },
  ],
};

const riskMetrics = [
  {
    name: 'VaR (Value at Risk)',
    description: 'Estimates the maximum potential loss over a specific time period at a given confidence level. For example, 95% daily VaR of $1,000 means there\'s a 95% chance daily losses won\'t exceed $1,000.',
    methods: [
      { name: 'Historical', description: 'Uses actual past returns, sorts them, and picks the percentile. No assumptions about distribution.' },
      { name: 'Parametric', description: 'Assumes returns follow a normal distribution. Uses mean and standard deviation to calculate.' },
      { name: 'Monte Carlo', description: 'Runs 10,000 simulations of possible future returns, accounting for correlations between assets.' },
    ],
    confidenceLevels: [
      { level: '95%', meaning: '1 in 20 chance of exceeding this loss' },
      { level: '99%', meaning: '1 in 100 chance of exceeding this loss' },
    ],
    proTip: 'VaR doesn\'t tell you how bad losses could be beyond the threshold - that\'s what CVaR is for.',
  },
  {
    name: 'CVaR (Conditional Value at Risk)',
    description: 'Also called Expected Shortfall. Measures the expected loss given that the loss exceeds VaR. Answers: "When things go bad, how bad do they get on average?"',
    interpretation: [
      { condition: 'CVaR/VaR ratio > 1.5', meaning: 'Fat tails - extreme losses could be much worse than VaR suggests' },
      { condition: 'CVaR/VaR ratio 1.2-1.5', meaning: 'Moderate tail risk - some potential for extreme losses' },
      { condition: 'CVaR/VaR ratio < 1.2', meaning: 'Normal tail risk - losses beyond VaR are not extreme' },
    ],
    proTip: 'CVaR is considered a more conservative and coherent risk measure than VaR.',
  },
  {
    name: 'GARCH Volatility',
    description: 'Models how volatility changes over time. Captures "volatility clustering" - the tendency for high volatility to follow high volatility.',
    components: [
      { name: 'Current Volatility', description: 'Today\'s estimated volatility based on recent market behavior' },
      { name: 'Forecast Volatility', description: 'Predicted volatility for the next period' },
      { name: 'Long-run Volatility', description: 'The average volatility the market tends toward over time' },
      { name: 'Persistence', description: 'How long volatility shocks last (0-1, higher = longer lasting)' },
      { name: 'Half-life', description: 'Days for a volatility shock to decay by 50%' },
    ],
    proTip: 'High persistence means current volatility conditions will likely continue.',
  },
];

// Collapsible section component
function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-dark-bg/40 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary-400" />
          <span className="font-semibold text-dark-text-primary">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-dark-text-tertiary" />
        ) : (
          <ChevronDown className="w-5 h-5 text-dark-text-tertiary" />
        )}
      </button>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
        >
          <CardContent>{children}</CardContent>
        </motion.div>
      )}
    </Card>
  );
}

// Indicator card component
function IndicatorCard({ indicator }: { indicator: typeof momentumIndicators[0] }) {
  return (
    <div className="p-4 bg-dark-bg/60 rounded-lg border border-dark-border space-y-3">
      <div className="flex items-start justify-between">
        <h4 className="font-semibold text-dark-text-primary">{indicator.name}</h4>
        <span className="text-xs text-dark-text-muted bg-dark-surface px-2 py-1 rounded">
          {indicator.period}
        </span>
      </div>

      <p className="text-sm text-dark-text-secondary">{indicator.description}</p>

      <div className="p-2 bg-dark-surface rounded text-xs font-mono text-dark-text-tertiary">
        {indicator.calculation}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-dark-text-secondary">Interpretation:</p>
        {indicator.interpretation.map((item, index) => (
          <div key={index} className="flex items-start gap-2 text-xs">
            <code className="px-1.5 py-0.5 bg-dark-surface rounded text-dark-text-tertiary shrink-0">
              {item.condition}
            </code>
            <span className={item.color}>{item.signal}</span>
            <span className="text-dark-text-muted">- {item.action}</span>
          </div>
        ))}
      </div>

      <div className="p-2 bg-primary-500/10 border border-primary-500/20 rounded text-xs text-primary-300">
        <strong>Pro tip:</strong> {indicator.proTip}
      </div>
    </div>
  );
}

export function HelpPage() {
  const [showEducation, setShowEducation] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Getting Started */}
      <Card>
        <CardHeader icon={<HelpCircle className="w-5 h-5" />}>
          Getting Started
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-dark-text-secondary">
              Stock Sense AI is a trading signal detection platform that uses technical analysis
              to identify potential trading opportunities. Use the tabs above to navigate between
              different features.
            </p>
            <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-lg">
              <p className="text-sm text-primary-300">
                <strong>Quick Start:</strong> Go to the Monitoring tab, configure your watchlist,
                and click Start to begin receiving real-time trading signals.
              </p>
            </div>

            {/* Toggle for education section */}
            <div className="flex items-center gap-4">
              <Button
                variant={showEducation ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setShowEducation(!showEducation)}
              >
                <BookOpen className="w-4 h-4" />
                {showEducation ? 'Hide' : 'Show'} Technical Education
              </Button>
              <span className="text-xs text-dark-text-muted">
                Learn what each indicator and metric means
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Sections */}
      {sections.map((section, sectionIndex) => (
        <motion.div
          key={section.title}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: sectionIndex * 0.1 }}
        >
          <Card>
            <CardHeader icon={<section.icon className="w-5 h-5" />}>
              {section.title}
            </CardHeader>
            <CardContent>
              <p className="text-dark-text-secondary mb-4">{section.description}</p>
              <div className="grid gap-4 md:grid-cols-3">
                {section.features.map((feature, featureIndex) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: sectionIndex * 0.1 + featureIndex * 0.05 }}
                    className="p-4 bg-dark-bg/60 rounded-lg border border-dark-border hover:border-dark-border-hover transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <feature.icon className="w-4 h-4 text-primary-400" />
                      <h4 className="font-medium text-dark-text-primary">{feature.title}</h4>
                    </div>
                    <p className="text-sm text-dark-text-tertiary">{feature.description}</p>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {/* Technical Education Section */}
      {showEducation && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-2 mt-8 mb-4">
            <BookOpen className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-bold text-dark-text-primary">Technical Education</h2>
          </div>

          {/* Momentum Indicators */}
          <CollapsibleSection title="Momentum Indicators" icon={Gauge} defaultOpen>
            <p className="text-sm text-dark-text-secondary mb-4">
              Momentum indicators measure the speed of price movement. They help identify overbought and oversold conditions,
              and can signal potential reversals before they happen in price.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {momentumIndicators.map((indicator) => (
                <IndicatorCard key={indicator.name} indicator={indicator} />
              ))}
            </div>
          </CollapsibleSection>

          {/* Trend Indicators */}
          <CollapsibleSection title="Trend Indicators" icon={TrendingUp}>
            <p className="text-sm text-dark-text-secondary mb-4">
              Trend indicators help identify the direction and strength of price movements. They smooth out price noise
              to reveal the underlying trend.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {trendIndicators.map((indicator) => (
                <IndicatorCard key={indicator.name} indicator={indicator} />
              ))}
            </div>
          </CollapsibleSection>

          {/* Volatility Indicators */}
          <CollapsibleSection title="Volatility Indicators" icon={Activity}>
            <p className="text-sm text-dark-text-secondary mb-4">
              Volatility indicators measure the magnitude of price movements regardless of direction.
              They help with position sizing, stop loss placement, and identifying potential breakouts.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {volatilityIndicators.map((indicator) => (
                <IndicatorCard key={indicator.name} indicator={indicator} />
              ))}
            </div>
          </CollapsibleSection>

          {/* Volume Indicators */}
          <CollapsibleSection title="Volume Indicators" icon={BarChart3}>
            <p className="text-sm text-dark-text-secondary mb-4">
              Volume indicators analyze trading activity. Volume confirms price movements -
              a price move on high volume is more significant than one on low volume.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {volumeIndicators.map((indicator) => (
                <IndicatorCard key={indicator.name} indicator={indicator} />
              ))}
            </div>
          </CollapsibleSection>

          {/* Market Regime */}
          <CollapsibleSection title="Market Regime Detection" icon={Layers}>
            <p className="text-sm text-dark-text-secondary mb-4">{marketRegimeInfo.description}</p>

            <div className="grid gap-4 md:grid-cols-2">
              {marketRegimeInfo.regimes.map((regime) => (
                <div key={regime.type} className={`p-4 rounded-lg border border-dark-border ${regime.bgColor}`}>
                  <h4 className={`font-bold ${regime.color} mb-2`}>{regime.type}</h4>
                  <p className="text-sm text-dark-text-secondary mb-3">{regime.description}</p>

                  <div className="space-y-1 mb-3">
                    <p className="text-xs font-medium text-dark-text-tertiary">Conditions:</p>
                    <ul className="text-xs text-dark-text-secondary space-y-1">
                      {regime.conditions.map((condition, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-dark-text-muted">-</span>
                          {condition}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-2 bg-dark-bg/60 rounded">
                    <p className="text-xs"><strong className="text-dark-text-secondary">Trading approach:</strong> <span className="text-dark-text-tertiary">{regime.trading}</span></p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 p-3 bg-dark-surface rounded-lg">
              <p className="text-xs font-medium text-dark-text-secondary mb-2">Regime Metrics:</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {marketRegimeInfo.metrics.map((metric) => (
                  <div key={metric.name} className="text-xs">
                    <span className="font-medium text-dark-text-primary">{metric.name}:</span>{' '}
                    <span className="text-dark-text-tertiary">{metric.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleSection>

          {/* Risk Metrics */}
          <CollapsibleSection title="Risk Metrics" icon={Shield}>
            <p className="text-sm text-dark-text-secondary mb-4">
              Risk metrics help quantify potential losses and manage portfolio risk. Understanding these helps
              you size positions appropriately and protect your capital.
            </p>

            <div className="space-y-4">
              {riskMetrics.map((metric) => (
                <div key={metric.name} className="p-4 bg-dark-bg/60 rounded-lg border border-dark-border">
                  <h4 className="font-semibold text-dark-text-primary mb-2">{metric.name}</h4>
                  <p className="text-sm text-dark-text-secondary mb-3">{metric.description}</p>

                  {'methods' in metric && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-dark-text-secondary mb-2">Calculation Methods:</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {metric.methods.map((method) => (
                          <div key={method.name} className="p-2 bg-dark-surface rounded text-xs">
                            <span className="font-medium text-primary-400">{method.name}:</span>{' '}
                            <span className="text-dark-text-tertiary">{method.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {'confidenceLevels' in metric && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-dark-text-secondary mb-2">Confidence Levels:</p>
                      <div className="flex gap-4">
                        {metric.confidenceLevels.map((level) => (
                          <div key={level.level} className="text-xs">
                            <span className="font-mono text-primary-400">{level.level}</span>{' '}
                            <span className="text-dark-text-tertiary">= {level.meaning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {'interpretation' in metric && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-dark-text-secondary mb-2">Interpretation:</p>
                      {metric.interpretation.map((item, i) => (
                        <div key={i} className="text-xs mb-1">
                          <code className="px-1.5 py-0.5 bg-dark-surface rounded text-dark-text-tertiary">
                            {item.condition}
                          </code>
                          <span className="text-dark-text-secondary ml-2">{item.meaning}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {'components' in metric && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-dark-text-secondary mb-2">Components:</p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {metric.components.map((comp) => (
                          <div key={comp.name} className="p-2 bg-dark-surface rounded text-xs">
                            <span className="font-medium text-primary-400">{comp.name}:</span>{' '}
                            <span className="text-dark-text-tertiary">{comp.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-2 bg-primary-500/10 border border-primary-500/20 rounded text-xs text-primary-300">
                    <strong>Pro tip:</strong> {metric.proTip}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Signal Interpretation */}
          <CollapsibleSection title="How Signals Are Generated" icon={Target}>
            <p className="text-sm text-dark-text-secondary mb-4">
              Stock Sense AI combines multiple indicators to generate trading signals. Here's how the system interprets the data:
            </p>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 bg-success-500/10 border border-success-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-success-400" />
                  <h4 className="font-semibold text-success-400">Bullish Signals</h4>
                </div>
                <ul className="text-xs text-dark-text-secondary space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 mt-0.5 text-success-400 shrink-0" />
                    <span>RSI below 30 (oversold condition)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 mt-0.5 text-success-400 shrink-0" />
                    <span>MACD line crosses above signal line</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 mt-0.5 text-success-400 shrink-0" />
                    <span>SMAs aligned bullishly (20 &gt; 50 &gt; 200)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3 h-3 mt-0.5 text-success-400 shrink-0" />
                    <span>High volume with increasing trend</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-danger-500/10 border border-danger-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="w-5 h-5 text-danger-400" />
                  <h4 className="font-semibold text-danger-400">Bearish Signals</h4>
                </div>
                <ul className="text-xs text-dark-text-secondary space-y-2">
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 mt-0.5 text-danger-400 shrink-0" />
                    <span>RSI above 70 (overbought condition)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 mt-0.5 text-danger-400 shrink-0" />
                    <span>MACD line crosses below signal line</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 mt-0.5 text-danger-400 shrink-0" />
                    <span>SMAs aligned bearishly (20 &lt; 50 &lt; 200)</span>
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-warning-500/10 border border-warning-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-5 h-5 text-warning-400" />
                  <h4 className="font-semibold text-warning-400">Neutral Signals</h4>
                </div>
                <ul className="text-xs text-dark-text-secondary space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="w-3 h-3 mt-0.5 text-warning-400 shrink-0">-</span>
                    <span>RSI between 30-70 (normal range)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-3 h-3 mt-0.5 text-warning-400 shrink-0">-</span>
                    <span>Low volume (&lt; 0.7x average)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-3 h-3 mt-0.5 text-warning-400 shrink-0">-</span>
                    <span>Mixed or sideways market regime</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-4 p-4 bg-dark-surface rounded-lg">
              <h4 className="font-medium text-dark-text-primary mb-2">Confidence Score Calculation</h4>
              <p className="text-sm text-dark-text-tertiary mb-2">
                The confidence score (0-100%) reflects how many indicators agree on the signal:
              </p>
              <ul className="text-xs text-dark-text-secondary space-y-1">
                <li>- Base confidence from market regime (70% base)</li>
                <li>- +20% if trend strength &gt; 60% AND volume ratio &gt; 1.2</li>
                <li>- -20% if weak SMA alignment AND high volatility</li>
                <li>- Higher confidence = more indicators pointing the same direction</li>
              </ul>
            </div>
          </CollapsibleSection>
        </motion.div>
      )}

      {/* Keyboard Shortcuts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card>
          <CardHeader icon={<Keyboard className="w-5 h-5" />}>
            Keyboard Shortcuts
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.description}
                  className="flex items-center justify-between p-3 bg-dark-bg/60 rounded-lg border border-dark-border"
                >
                  <span className="text-sm text-dark-text-secondary">{shortcut.description}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, index) => (
                      <span key={index}>
                        <kbd className="px-2 py-1 bg-dark-surface rounded text-xs font-mono text-dark-text-tertiary">
                          {key}
                        </kbd>
                        {index < shortcut.keys.length - 1 && (
                          <span className="text-dark-text-muted mx-1">+</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Important Notes */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardHeader icon={<AlertTriangle className="w-5 h-5" />}>
            Important Notes
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-dark-text-tertiary">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-success-400 flex-shrink-0" />
                <span>Signals are based on technical indicators and should not be considered financial advice.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-success-400 flex-shrink-0" />
                <span>Higher confidence scores indicate stronger signal alignment across multiple indicators.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-success-400 flex-shrink-0" />
                <span>Always verify signals with your own research before making trading decisions.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-success-400 flex-shrink-0" />
                <span>Risk metrics like VaR help quantify potential losses - use appropriate position sizing.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-success-400 flex-shrink-0" />
                <span>No indicator is perfect - use multiple indicators together for confirmation.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 text-success-400 flex-shrink-0" />
                <span>Past performance and backtests don't guarantee future results.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
