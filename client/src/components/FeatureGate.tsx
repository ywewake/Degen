// CryptoAlpha — Feature Gate Component
// Renders a locked overlay with upgrade prompt when a feature is not available
// on the current plan. Used throughout the app to gate PRO and SIGNALS features.

import { Lock, Star, Crown } from 'lucide-react';
import { usePlan, type PlanFeatures, type PlanTier } from '@/contexts/PlanContext';
import { toast } from 'sonner';
import type { ReactNode } from 'react';

interface FeatureGateProps {
  feature: keyof PlanFeatures;
  children: ReactNode;
  /** Optional: show a compact inline lock instead of full overlay */
  compact?: boolean;
  /** Optional: override the label shown on the lock */
  label?: string;
}

const REQUIRED_PLAN: Partial<Record<keyof PlanFeatures, PlanTier>> = {
  allTimeframes: 'PRO',
  priceAlerts: 'PRO',
  savedWatchlist: 'PRO',
  tradeJournal: 'PRO',
  equityCurve: 'PRO',
  signalHistory: 'PRO',
  advancedRisk: 'PRO',
  liveSignalFeed: 'SIGNALS',
  portfolioTracker: 'SIGNALS',
  dailyBriefing: 'SIGNALS',
  exportHistory: 'SIGNALS',
  whaleAlerts: 'SIGNALS',
  apiAccess: 'SIGNALS',
};

const PLAN_LABELS: Record<PlanTier, string> = {
  FREE: 'Free',
  PRO: 'Pro — $29/mo',
  SIGNALS: 'Signals — $99/mo',
};

const PLAN_COLORS: Record<PlanTier, { text: string; border: string; bg: string; icon: typeof Star }> = {
  FREE: { text: 'text-muted-foreground', border: 'border-border', bg: 'bg-secondary/50', icon: Star },
  PRO: { text: 'text-[oklch(0.78_0.22_155)]', border: 'border-[oklch(0.78_0.22_155)]/40', bg: 'bg-[oklch(0.78_0.22_155)]/5', icon: Star },
  SIGNALS: { text: 'text-[oklch(0.78_0.18_75)]', border: 'border-[oklch(0.78_0.18_75)]/40', bg: 'bg-[oklch(0.78_0.18_75)]/5', icon: Crown },
};

export function FeatureGate({ feature, children, compact = false, label }: FeatureGateProps) {
  const { can, setPlan } = usePlan();

  if (can(feature)) return <>{children}</>;

  const requiredPlan = REQUIRED_PLAN[feature] ?? 'PRO';
  const colors = PLAN_COLORS[requiredPlan];
  const PlanIcon = colors.icon;

  const handleUpgrade = () => {
    // For testing: instantly unlock by switching plan
    setPlan(requiredPlan);
    toast.success(`Switched to ${requiredPlan} — feature unlocked!`);
  };

  if (compact) {
    return (
      <button
        onClick={handleUpgrade}
        aria-label={`Unlock ${label ?? feature} — requires ${PLAN_LABELS[requiredPlan]}`}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono font-semibold transition-all hover:opacity-80 active:scale-95 ${colors.text} ${colors.border} ${colors.bg}`}
      >
        <Lock className="w-2.5 h-2.5" />
        {label ?? PLAN_LABELS[requiredPlan]}
      </button>
    );
  }

  return (
    <div className="relative rounded overflow-hidden">
      {/* Blurred content preview */}
      <div className="pointer-events-none select-none blur-[3px] opacity-40">
        {children}
      </div>

      {/* Lock overlay */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 rounded border ${colors.border} ${colors.bg}`}>
        <div className={`flex items-center gap-1.5 ${colors.text}`}>
          <PlanIcon className="w-4 h-4" />
          <span className="text-xs font-bold font-mono">{PLAN_LABELS[requiredPlan]}</span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono text-center px-4">
          {label ?? `Unlock with ${PLAN_LABELS[requiredPlan]}`}
        </p>
        <button
          onClick={handleUpgrade}
          className={`mt-1 px-4 py-1.5 rounded border text-[10px] font-mono font-bold transition-all hover:opacity-80 active:scale-95 ${colors.text} ${colors.border} ${colors.bg}`}
        >
          Unlock Now (Test)
        </button>
      </div>
    </div>
  );
}

/** Inline lock badge — shows next to a feature label when locked */
export function LockBadge({ feature, label }: { feature: keyof PlanFeatures; label?: string }) {
  return <FeatureGate feature={feature} compact label={label}><span /></FeatureGate>;
}
