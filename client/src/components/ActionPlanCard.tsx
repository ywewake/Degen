// ActionPlanCard — Plain-English action plan
// Design: Terminal dark, prominent signal color, readable text

import { Lightbulb, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Signal, RiskLevel } from '@/services/analysis';

interface Props {
  plan: string;
  signal: Signal;
  risk: RiskLevel;
}

const SIGNAL_CONFIG = {
  BUY: {
    icon: TrendingUp,
    label: 'BUY SIGNAL',
    color: 'text-[oklch(0.78_0.22_155)]',
    bg: 'bg-[oklch(0.78_0.22_155/0.06)]',
    border: 'border-[oklch(0.78_0.22_155/0.25)]',
    iconColor: 'text-[oklch(0.78_0.22_155)]',
  },
  SELL: {
    icon: TrendingDown,
    label: 'SELL SIGNAL',
    color: 'text-[oklch(0.65_0.22_27)]',
    bg: 'bg-[oklch(0.65_0.22_27/0.06)]',
    border: 'border-[oklch(0.65_0.22_27/0.25)]',
    iconColor: 'text-[oklch(0.65_0.22_27)]',
  },
  NEUTRAL: {
    icon: Minus,
    label: 'NEUTRAL',
    color: 'text-[oklch(0.78_0.18_75)]',
    bg: 'bg-[oklch(0.78_0.18_75/0.06)]',
    border: 'border-[oklch(0.78_0.18_75/0.2)]',
    iconColor: 'text-[oklch(0.78_0.18_75)]',
  },
};

const RISK_BADGE = {
  LOW: 'text-[oklch(0.78_0.22_155)] border-[oklch(0.78_0.22_155/0.3)] bg-[oklch(0.78_0.22_155/0.08)]',
  MEDIUM: 'text-[oklch(0.78_0.18_75)] border-[oklch(0.78_0.18_75/0.3)] bg-[oklch(0.78_0.18_75/0.08)]',
  HIGH: 'text-[oklch(0.65_0.22_27)] border-[oklch(0.65_0.22_27/0.3)] bg-[oklch(0.65_0.22_27/0.08)]',
};

export function ActionPlanCard({ plan, signal, risk }: Props) {
  const cfg = SIGNAL_CONFIG[signal];
  const SignalIcon = cfg.icon;

  return (
    <div className={`data-card p-4 border ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Action Plan</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono font-bold border rounded px-2 py-0.5 ${RISK_BADGE[risk]}`}>
            {risk} RISK
          </span>
          <div className={`flex items-center gap-1 text-xs font-mono font-bold ${cfg.color}`}>
            <SignalIcon className="w-3.5 h-3.5" />
            {cfg.label}
          </div>
        </div>
      </div>

      <p className="text-sm text-foreground/85 leading-relaxed">{plan}</p>

      <div className="mt-3 pt-3 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground">
          ⚠ Not financial advice. Always do your own research. Past signals do not guarantee future results.
        </p>
      </div>
    </div>
  );
}
