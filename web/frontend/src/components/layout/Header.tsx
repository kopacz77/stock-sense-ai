import { useTradingStore } from '@/stores/useTradingStore';
import { cn } from '@/utils/cn';

export function Header() {
  const { isConnected } = useTradingStore();

  return (
    <header className="sticky top-0 z-50 bg-dark-bg/95 backdrop-blur-xl border-b border-dark-border shadow-glass">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary-500 to-success-500 bg-clip-text text-transparent">
            <span className="mr-2">📊</span>
            Stock Sense AI
          </h1>

          {/* Connection Status */}
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full',
              'font-semibold text-sm',
              'backdrop-blur-xl border shadow-lg',
              'transition-all duration-300',
              isConnected
                ? 'bg-gradient-to-br from-success-500 to-success-700 border-success-500/30 shadow-glow-green text-white'
                : 'bg-gradient-to-br from-danger-500 to-danger-700 border-danger-500/30 shadow-glow-red text-white animate-pulse-slow'
            )}
          >
            <div
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected ? 'bg-white' : 'bg-white/80'
              )}
            />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </div>
    </header>
  );
}
