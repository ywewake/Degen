// CryptoAlpha — Plan Switcher
// - Authenticated users: shows current plan + manage subscription (Stripe billing portal)
// - Unauthenticated users: dev mode instant plan switcher for testing

import { usePlan, type PlanTier } from '@/contexts/PlanContext';
import { Crown, Star, Zap, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';

const TIERS: { tier: PlanTier; label: string; icon: typeof Crown; color: string; bg: string }[] = [
  {
    tier: 'FREE',
    label: 'FREE',
    icon: Zap,
    color: 'text-muted-foreground',
    bg: 'bg-secondary',
  },
  {
    tier: 'PRO',
    label: 'PRO',
    icon: Star,
    color: 'text-[oklch(0.78_0.22_155)]',
    bg: 'bg-[oklch(0.78_0.22_155)]/10',
  },
  {
    tier: 'SIGNALS',
    label: 'SIGNALS',
    icon: Crown,
    color: 'text-[oklch(0.78_0.18_75)]',
    bg: 'bg-[oklch(0.78_0.18_75)]/10',
  },
];

export function PlanBadge() {
  const { plan } = usePlan();
  const t = TIERS.find(x => x.tier === plan)!;
  const Icon = t.icon;
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] font-mono font-bold ${t.color} ${t.bg}`}>
      <Icon className="w-3 h-3" />
      {t.label}
    </div>
  );
}

export function PlanSwitcher() {
  const { plan, setPlan, isDbSynced } = usePlan();

  // Auth state
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAuthenticated = Boolean(user);

  // Billing portal mutation
  const createPortal = trpc.stripe.createPortalSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(`Billing portal error: ${err.message}`);
    },
  });

  const handleSwitch = (tier: PlanTier) => {
    if (isAuthenticated) return; // Authenticated users use Stripe
    setPlan(tier);
    const messages: Record<PlanTier, string> = {
      FREE: 'Switched to FREE plan',
      PRO: '⭐ PRO features unlocked — price alerts, all timeframes, trade journal, equity curve',
      SIGNALS: '👑 SIGNALS features unlocked — live feed, portfolio tracker, daily briefing, export',
    };
    toast.success(messages[tier]);
  };

  const handleManageSubscription = () => {
    createPortal.mutate({ returnUrl: window.location.href });
  };

  // Authenticated users: show subscription management
  if (isAuthenticated && isDbSynced) {
    const t = TIERS.find(x => x.tier === plan)!;
    const Icon = t.icon;
    return (
      <div className="data-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Your Subscription</h3>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Managed via Stripe</p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded border border-border text-[10px] font-mono font-bold ${t.color} ${t.bg}`}>
            <Icon className="w-3 h-3" />
            {t.label}
          </div>
        </div>

        {plan !== 'FREE' && (
          <button
            onClick={handleManageSubscription}
            disabled={createPortal.isPending}
            className="w-full flex items-center justify-center gap-2 py-2 rounded border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-50"
          >
            {createPortal.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ExternalLink className="w-3.5 h-3.5" />
            )}
            Manage Subscription
          </button>
        )}

        {plan === 'FREE' && (
          <p className="text-[10px] text-muted-foreground text-center">
            Upgrade above to unlock Pro or Signals features.
          </p>
        )}
      </div>
    );
  }

  // Unauthenticated users: dev mode instant plan switcher
  return (
    <div className="data-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Test Plan Tiers</h3>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">Switch instantly to test all features</p>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground/60 border border-border rounded px-1.5 py-0.5">DEV MODE</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TIERS.map(t => {
          const Icon = t.icon;
          const isActive = plan === t.tier;
          return (
            <button
              key={t.tier}
              onClick={() => handleSwitch(t.tier)}
              aria-pressed={isActive}
              aria-label={`Switch to ${t.tier} plan`}
              className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded border transition-all active:scale-95 ${
                isActive
                  ? `${t.bg} border-current ${t.color} ring-1 ring-current/30`
                  : 'border-border text-muted-foreground hover:border-border/80 hover:bg-secondary/40'
              }`}
            >
              {isActive && (
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[8px] font-mono bg-background border border-current px-1 rounded-full text-current">
                  ACTIVE
                </span>
              )}
              <Icon className={`w-4 h-4 ${isActive ? t.color : ''}`} />
              <span className={`text-[10px] font-mono font-bold ${isActive ? t.color : ''}`}>{t.tier}</span>
              <span className="text-[9px] text-muted-foreground">
                {t.tier === 'FREE' ? 'Free' : t.tier === 'PRO' ? '$29/mo' : '$99/mo'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <p className="text-[9px] text-muted-foreground/60 font-mono text-center">
          Sign in to subscribe with real payment
        </p>
      </div>
    </div>
  );
}
