import { useTradingStore } from '@/stores/useTradingStore';
import { cn } from '@/utils/cn';
import { BarChart3, Wifi, WifiOff } from 'lucide-react';

export function Header() {
  const { isConnected } = useTradingStore();

  return (
    <header className="sticky top-0 z-50 bg-dark-bg/95 backdrop-blur-xl border-b border-dark-border shadow-glass">
      <div className="container mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold">
            <BarChart3 className="w-6 h-6 sm:w-7 sm:h-7 text-primary-500" aria-hidden="true" />
            <span className="bg-gradient-to-r from-primary-400 to-success-400 bg-clip-text text-transparent">
              Stock Sense AI
            </span>
          </h1>

          {/* Connection Status */}
          <div
            role="status"
            aria-live="polite"
            aria-label={isConnected ? 'Connected to server' : 'Disconnected from server'}
            className={cn(
              'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full',
              'font-semibold text-xs sm:text-sm',
              'backdrop-blur-xl border shadow-lg',
              'transition-all duration-300',
              isConnected
                ? 'bg-gradient-to-br from-success-500 to-success-700 border-success-500/30 shadow-glow-green text-white'
                : 'bg-gradient-to-br from-danger-500 to-danger-700 border-danger-500/30 shadow-glow-red text-white animate-pulse-slow'
            )}
          >
            {isConnected ? (
              <Wifi className="w-4 h-4" aria-hidden="true" />
            ) : (
              <WifiOff className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
