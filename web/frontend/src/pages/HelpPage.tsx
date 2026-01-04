import { motion } from 'framer-motion';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
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
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

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
  { keys: ['←', '→'], description: 'Navigate between tabs (when focused)' },
];

export function HelpPage() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
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

      {/* Tips */}
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
            </ul>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
