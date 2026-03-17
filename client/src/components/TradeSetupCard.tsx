// CryptoAlpha — Trade Setup Card
// Design: Terminal-Brutalism dark theme
// Shows entry zone, stop loss, TP1/TP2/TP3, R:R, position size, timeframe selector

import { useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, Shield, Clock, Zap, ChevronDown } from 'lucide-react';
import type { AnalysisResult } from '@/services/analysis';
import { generateTradeSetup, type TradeSetup, type TradeDirection, type TradeTimeframe } from '@/services/tradeSetup';
import { formatPrice as fmtPrice, formatPercent } from '@/lib/format';
const fmtPct = (n: number) => formatPercent(n, 2).replace('+', '');

interface Props {
  result: AnalysisResult;
  onEnterTrade: (setup: TradeSetup) => void;
}

const TIMEFRAMES: { value: TradeTimeframe; label: string; short: string }[] = [
  { value: '1h', label: '1 Hour', short: '1H' },
  { value: '4h', label: '4 Hours', short: '4H' },
  { value: '1d', label: '1 Day', short: '1D' },
  { value: '1w', label: '1 Week', short: '1W' },
];

export function TradeSetupCard({ result, onEnterTrade }: Props) {
  const [timeframe, setTimeframe] = useState<TradeTimeframe>('4h');
  const [direction, setDirection] = useState<TradeDirection>(
    result.dominantSignal === 'SELL' ? 'SHORT' : 'LONG'
  );

  const setup = useMemo(
    () => generateTradeSetup(result, timeframe, direction),
    [result, timeframe, direction]
  );

  const isLong = direction === 'LONG';
  const signalColor = isLong ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]';
  const signalBg = isLong ? 'bg-[oklch(0.75_0.22_145)]/10 border-[oklch(0.75_0.22_145)]/30' : 'bg-[oklch(0.65_0.22_27)]/10 border-[oklch(0.65_0.22_27)]/30';
  const signalBorder = isLong ? 'border-[oklch(0.75_0.22_145)]/40' : 'border-[oklch(0.65_0.22_27)]/40';

  const confColor =
    setup.confidence >= 70
      ? 'text-[oklch(0.75_0.22_145)]'
      : setup.confidence >= 50
      ? 'text-[oklch(0.78_0.18_75)]'
      : 'text-[oklch(0.65_0.22_27)]';

  return (
    <div className="data-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground tracking-widest uppercase">
            Trade Setup
          </span>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-bold font-mono ${signalBg} ${signalColor}`}>
          {isLong ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {direction}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-4 pt-3">
        {/* Direction + Timeframe Controls */}
        <div className="flex gap-2">
          {/* Direction toggle */}
          <div className="flex rounded border border-border overflow-hidden text-xs font-mono font-bold flex-1">
            <button
              onClick={() => setDirection('LONG')}
              className={`flex-1 py-2 transition-colors ${
                direction === 'LONG'
                  ? 'bg-[oklch(0.75_0.22_145)]/15 text-[oklch(0.75_0.22_145)] border-r border-[oklch(0.75_0.22_145)]/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ↑ LONG
            </button>
            <button
              onClick={() => setDirection('SHORT')}
              className={`flex-1 py-2 transition-colors ${
                direction === 'SHORT'
                  ? 'bg-[oklch(0.65_0.22_27)]/15 text-[oklch(0.65_0.22_27)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ↓ SHORT
            </button>
          </div>

          {/* Timeframe selector */}
          <div className="flex rounded border border-border overflow-hidden text-xs font-mono font-bold">
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.value}
                onClick={() => setTimeframe(tf.value)}
                className={`px-2.5 py-2 transition-colors ${
                  timeframe === tf.value
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tf.short}
              </button>
            ))}
          </div>
        </div>

        {/* Confidence bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Setup Confidence</span>
            <span className={`text-xs font-bold font-mono ${confColor}`}>{setup.confidence}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                setup.confidence >= 70
                  ? 'bg-[oklch(0.75_0.22_145)]'
                  : setup.confidence >= 50
                  ? 'bg-[oklch(0.78_0.18_75)]'
                  : 'bg-[oklch(0.65_0.22_27)]'
              }`}
              style={{ width: `${setup.confidence}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{setup.rationale}</p>
        </div>

        {/* Price levels grid */}
        <div className="space-y-2">
          {/* Entry Zone */}
          <div className="flex items-center justify-between py-2 px-3 rounded bg-secondary/50 border border-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[oklch(0.78_0.18_75)]" />
              <span className="text-xs text-muted-foreground font-mono uppercase">Entry Zone</span>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-foreground">
                {fmtPrice(setup.entryZoneLow)} – {fmtPrice(setup.entryZoneHigh)}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                Ideal: {fmtPrice(setup.entryPrice)}
              </div>
            </div>
          </div>

          {/* Stop Loss */}
          <div className="flex items-center justify-between py-2 px-3 rounded bg-[oklch(0.65_0.22_27)]/8 border border-[oklch(0.65_0.22_27)]/25">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-[oklch(0.65_0.22_27)]" />
              <span className="text-xs text-[oklch(0.65_0.22_27)] font-mono uppercase font-bold">Stop Loss</span>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-bold text-[oklch(0.65_0.22_27)]">
                {fmtPrice(setup.stopLoss)}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                -{fmtPct(setup.stopLossPct)} risk
              </div>
            </div>
          </div>

          {/* Targets */}
          {setup.targets.map((tp, i) => {
            const opacity = i === 0 ? 'opacity-70' : i === 1 ? 'opacity-85' : 'opacity-100';
            const borderOpacity = i === 0 ? '/20' : i === 1 ? '/30' : '/45';
            return (
              <div
                key={tp.label}
                className={`flex items-center justify-between py-2 px-3 rounded bg-[oklch(0.75_0.22_145)]/8 border border-[oklch(0.75_0.22_145)]${borderOpacity} ${opacity}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full bg-[oklch(0.75_0.22_145)]`} />
                  <span className="text-xs text-[oklch(0.75_0.22_145)] font-mono uppercase font-bold">
                    {tp.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    ({tp.partial}% exit)
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-[oklch(0.75_0.22_145)]">
                    {fmtPrice(tp.price)}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    +{fmtPct(tp.pctGain)} · {tp.rr}:1 R:R
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* R:R Summary row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center py-2 px-1 rounded bg-secondary border border-border">
            <div className="text-[10px] text-muted-foreground font-mono uppercase mb-0.5">Risk</div>
            <div className="text-xs font-bold font-mono text-[oklch(0.65_0.22_27)]">
              -{fmtPct(setup.stopLossPct)}
            </div>
          </div>
          <div className="text-center py-2 px-1 rounded bg-primary/10 border border-primary/30">
            <div className="text-[10px] text-muted-foreground font-mono uppercase mb-0.5">Best R:R</div>
            <div className="text-xs font-bold font-mono text-primary">
              1:{setup.riskReward}
            </div>
          </div>
          <div className="text-center py-2 px-1 rounded bg-secondary border border-border">
            <div className="text-[10px] text-muted-foreground font-mono uppercase mb-0.5">Size</div>
            <div className="text-xs font-bold font-mono text-foreground">
              {setup.positionSizePct.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Invalidation note */}
        <div className="flex gap-2 p-2.5 rounded bg-secondary/40 border border-border">
          <Zap className="w-3.5 h-3.5 text-[oklch(0.78_0.18_75)] shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">{setup.invalidationNote}</p>
        </div>

        {/* Paper Trade Button */}
        <button
          onClick={() => onEnterTrade(setup)}
          className={`w-full py-3 rounded font-bold text-sm transition-all active:scale-95 border ${
            isLong
              ? 'bg-[oklch(0.75_0.22_145)]/15 border-[oklch(0.75_0.22_145)]/40 text-[oklch(0.75_0.22_145)] hover:bg-[oklch(0.75_0.22_145)]/25'
              : 'bg-[oklch(0.65_0.22_27)]/15 border-[oklch(0.65_0.22_27)]/40 text-[oklch(0.65_0.22_27)] hover:bg-[oklch(0.65_0.22_27)]/25'
          }`}
        >
          {isLong ? '↑' : '↓'} Paper Trade — {direction} {result.ticker.toUpperCase()}
        </button>
      </div>
    </div>
  );
}
