// SignalsGrid — Multi-timeframe buy/sell/neutral signals
// Design: Terminal-Brutalism dark theme
// FREE: 1H live + 3 locked preview cards (real data blurred — you can SEE what you're missing)
// PRO: all 4 timeframes fully unlocked

import { Lock, Star } from 'lucide-react';
import { usePlan } from '@/contexts/PlanContext';
import { toast } from 'sonner';
import type { SignalData, Signal } from '@/services/analysis';

interface Props {
  signals: SignalData[];
  dominantSignal: Signal;
}

const SIGNAL_CONFIG = {
  BUY: {
    label: 'BUY',
    bg: 'bg-[oklch(0.78_0.22_155/0.12)]',
    border: 'border-[oklch(0.78_0.22_155/0.3)]',
    text: 'text-[oklch(0.78_0.22_155)]',
    bar: 'bg-[oklch(0.78_0.22_155)]',
    glow: 'shadow-[0_0_12px_oklch(0.78_0.22_155/0.2)]',
  },
  SELL: {
    label: 'SELL',
    bg: 'bg-[oklch(0.65_0.22_27/0.12)]',
    border: 'border-[oklch(0.65_0.22_27/0.3)]',
    text: 'text-[oklch(0.65_0.22_27)]',
    bar: 'bg-[oklch(0.65_0.22_27)]',
    glow: 'shadow-[0_0_12px_oklch(0.65_0.22_27/0.2)]',
  },
  NEUTRAL: {
    label: 'HOLD',
    bg: 'bg-[oklch(0.78_0.18_75/0.1)]',
    border: 'border-[oklch(0.78_0.18_75/0.25)]',
    text: 'text-[oklch(0.78_0.18_75)]',
    bar: 'bg-[oklch(0.78_0.18_75)]',
    glow: '',
  },
};

const DOMINANT_CONFIG = {
  BUY: {
    bg: 'bg-[oklch(0.78_0.22_155/0.08)]',
    border: 'border-[oklch(0.78_0.22_155/0.4)]',
    text: 'text-[oklch(0.78_0.22_155)]',
    label: 'OVERALL: BUY',
    glow: 'shadow-[0_0_20px_oklch(0.78_0.22_155/0.15)]',
  },
  SELL: {
    bg: 'bg-[oklch(0.65_0.22_27/0.08)]',
    border: 'border-[oklch(0.65_0.22_27/0.4)]',
    text: 'text-[oklch(0.65_0.22_27)]',
    label: 'OVERALL: SELL',
    glow: 'shadow-[0_0_20px_oklch(0.65_0.22_27/0.15)]',
  },
  NEUTRAL: {
    bg: 'bg-[oklch(0.78_0.18_75/0.06)]',
    border: 'border-[oklch(0.78_0.18_75/0.3)]',
    text: 'text-[oklch(0.78_0.18_75)]',
    label: 'OVERALL: NEUTRAL',
    glow: '',
  },
};

function SignalCard({ signal }: { signal: SignalData }) {
  const cfg = SIGNAL_CONFIG[signal.signal];
  const strengthPct = Math.round(signal.strength * 100);
  return (
    <div className={`rounded border p-3 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{signal.label}</span>
        <span className={`text-xs font-mono font-bold ${cfg.text}`}>{cfg.label}</span>
      </div>
      <div className="mb-2">
        <div className="flex justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">Strength</span>
          <span className={`text-[10px] font-mono font-bold ${cfg.text}`}>{strengthPct}%</span>
        </div>
        <div className="h-1 bg-background/50 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${cfg.bar} bar-fill`} style={{ width: `${strengthPct}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        <div>
          <span className="text-muted-foreground">Momentum </span>
          <span className={`font-mono font-semibold ${
            signal.momentumScore < 30 ? 'text-[oklch(0.78_0.22_155)]' :
            signal.momentumScore > 70 ? 'text-[oklch(0.65_0.22_27)]' : 'text-foreground'
          }`}>{signal.momentumScore.toFixed(1)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Trend </span>
          <span className={`font-mono font-semibold ${
            signal.trendDirection >= 0 ? 'text-[oklch(0.78_0.22_155)]' : 'text-[oklch(0.65_0.22_27)]'
          }`}>{signal.trendDirection > 0 ? '+' : ''}{signal.trendDirection.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function LockedSignalCard({ signal }: { signal: SignalData }) {
  const { setPlan } = usePlan();
  const cfg = SIGNAL_CONFIG[signal.signal];
  const strengthPct = Math.round(signal.strength * 100);

  const handleUnlock = () => {
    setPlan('PRO');
    toast.success('Switched to PRO — all 4 timeframes unlocked!');
  };

  return (
    <button
      onClick={handleUnlock}
      className="relative rounded border border-[oklch(0.78_0.22_155/0.3)] overflow-hidden text-left w-full hover:border-[oklch(0.78_0.22_155/0.6)] transition-colors group"
      aria-label={`Unlock ${signal.label} signal — requires Pro`}
    >
      {/* Real data shown but blurred */}
      <div className="p-3 blur-[3px] opacity-40 pointer-events-none select-none">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{signal.label}</span>
          <span className={`text-xs font-mono font-bold ${cfg.text}`}>{cfg.label}</span>
        </div>
        <div className="mb-2">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Strength</span>
            <span className={`text-[10px] font-mono font-bold ${cfg.text}`}>{strengthPct}%</span>
          </div>
          <div className="h-1 bg-background/50 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${strengthPct}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <div><span className="text-muted-foreground">Momentum </span><span className="font-mono">{signal.momentumScore.toFixed(1)}</span></div>
          <div><span className="text-muted-foreground">Trend </span><span className="font-mono">{signal.trendDirection > 0 ? '+' : ''}{signal.trendDirection.toFixed(2)}</span></div>
        </div>
      </div>
      {/* Lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[oklch(0.78_0.22_155/0.06)] group-hover:bg-[oklch(0.78_0.22_155/0.12)] transition-colors">
        <div className="flex items-center gap-1 text-[oklch(0.78_0.22_155)]">
          <Lock className="w-3 h-3" />
          <span className="text-[10px] font-mono font-bold">PRO</span>
        </div>
        <span className="text-[9px] text-muted-foreground font-mono">Tap to unlock</span>
      </div>
    </button>
  );
}

export function SignalsGrid({ signals, dominantSignal }: Props) {
  const { can } = usePlan();
  const dc = DOMINANT_CONFIG[dominantSignal];
  const allTimeframes = can('allTimeframes');

  // Always have all 4 signals for preview (even on FREE)
  const signal1h = signals.find(s => s.timeframe === '1h') ?? signals[0];
  const signal4h = signals.find(s => s.timeframe === '4h') ?? signals[1] ?? signals[0];
  const signal1d = signals.find(s => s.timeframe === '1d') ?? signals[2] ?? signals[0];
  const signal1w = signals.find(s => s.timeframe === '1w') ?? signals[3] ?? signals[0];

  return (
    <div className="data-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Signals</h3>
          {!allTimeframes && (
            <span className="text-[9px] font-mono bg-[oklch(0.78_0.22_155/0.1)] text-[oklch(0.78_0.22_155)] border border-[oklch(0.78_0.22_155/0.3)] rounded px-1.5 py-0.5 flex items-center gap-1">
              <Star className="w-2.5 h-2.5" />
              PRO unlocks 4 timeframes
            </span>
          )}
        </div>
        <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded border ${dc.bg} ${dc.border} ${dc.text} ${dc.glow}`}>
          {dc.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <SignalCard signal={signal1h} />
        {allTimeframes ? <SignalCard signal={signal4h} /> : <LockedSignalCard signal={signal4h} />}
        {allTimeframes ? <SignalCard signal={signal1d} /> : <LockedSignalCard signal={signal1d} />}
        {allTimeframes ? <SignalCard signal={signal1w} /> : <LockedSignalCard signal={signal1w} />}
      </div>

      {!allTimeframes && (
        <p className="text-[10px] text-muted-foreground/60 font-mono text-center mt-3">
          1H signal shown · PRO unlocks 4H, 1D, 1W
        </p>
      )}
    </div>
  );
}
