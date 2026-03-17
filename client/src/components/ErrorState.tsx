// ErrorState — Error display with retry
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: Props) {
  return (
    <div className="py-8 flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-[oklch(0.65_0.22_27/0.1)] border border-[oklch(0.65_0.22_27/0.3)] flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-[oklch(0.65_0.22_27)]" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground mb-1">Analysis Failed</p>
        <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:opacity-80 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
      )}
      <p className="text-xs text-muted-foreground text-center max-w-xs">
        Make sure you entered a valid ticker (e.g. BTC, ETH, SOL). CoinGecko free tier allows 30 req/min.
      </p>
    </div>
  );
}
