// LoadingState — Terminal-style loading animation
import { Zap } from 'lucide-react';

interface Props {
  ticker?: string;
}

const STEPS = [
  'Fetching market data...',
  'Calculating RSI & MACD...',
  'Analyzing sentiment...',
  'Assessing risk...',
  'Generating action plan...',
];

export function LoadingState({ ticker }: Props) {
  return (
    <div className="py-10 flex flex-col items-center gap-4">
      {/* Pulsing icon */}
      <div className="relative">
        <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center animate-pulse">
          <Zap className="w-6 h-6 text-primary" />
        </div>
        <div className="absolute inset-0 rounded-full border border-primary/20 animate-ping" />
      </div>

      {ticker && (
        <p className="font-mono font-bold text-primary text-lg tracking-widest">
          {ticker.toUpperCase()}
        </p>
      )}

      <div className="space-y-2 w-full max-w-xs">
        {STEPS.map((step, i) => (
          <div
            key={step}
            className="flex items-center gap-2 text-xs text-muted-foreground"
            style={{ animationDelay: `${i * 200}ms` }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
            <span className="font-mono">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
