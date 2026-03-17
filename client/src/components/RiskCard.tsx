// RiskCard — Risk level display with score breakdown
// Design: Terminal dark, color-coded risk levels

import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { RiskAssessment } from '@/services/analysis';

interface Props {
  risk: RiskAssessment;
}

const RISK_CONFIG = {
  LOW: {
    icon: ShieldCheck,
    color: 'text-[oklch(0.78_0.22_155)]',
    bg: 'bg-[oklch(0.78_0.22_155/0.08)]',
    border: 'border-[oklch(0.78_0.22_155/0.25)]',
    bar: 'bg-[oklch(0.78_0.22_155)]',
  },
  MEDIUM: {
    icon: Shield,
    color: 'text-[oklch(0.78_0.18_75)]',
    bg: 'bg-[oklch(0.78_0.18_75/0.08)]',
    border: 'border-[oklch(0.78_0.18_75/0.25)]',
    bar: 'bg-[oklch(0.78_0.18_75)]',
  },
  HIGH: {
    icon: ShieldAlert,
    color: 'text-[oklch(0.65_0.22_27)]',
    bg: 'bg-[oklch(0.65_0.22_27/0.08)]',
    border: 'border-[oklch(0.65_0.22_27/0.25)]',
    bar: 'bg-[oklch(0.65_0.22_27)]',
  },
};

export function RiskCard({ risk }: Props) {
  const cfg = RISK_CONFIG[risk.level];
  const Icon = cfg.icon;
  const scorePct = Math.round(risk.score * 100);

  const subScores = [
    { label: 'Volatility', value: risk.volatility },
    { label: 'Mkt Cap', value: risk.marketCapScore },
    { label: 'Liquidity', value: risk.liquidityScore },
  ];

  return (
    <div className={`data-card p-3 border ${cfg.border} ${cfg.bg}`}>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Risk
      </h3>

      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-5 h-5 ${cfg.color}`} />
        <span className={`font-mono font-bold text-base ${cfg.color}`}>{risk.level}</span>
      </div>

      {/* Overall score bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">Risk Score</span>
          <span className={`text-[10px] font-mono font-bold ${cfg.color}`}>{scorePct}%</span>
        </div>
        <div className="h-1 bg-background/50 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${cfg.bar} bar-fill`}
            style={{ width: `${scorePct}%` }}
          />
        </div>
      </div>

      {/* Sub-scores */}
      <div className="space-y-1.5">
        {subScores.map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground">{label}</span>
            <span className={`text-[10px] font-mono font-semibold ${cfg.color}`}>
              {Math.round(value * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
