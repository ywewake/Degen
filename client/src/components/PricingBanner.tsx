// PricingBanner — Monetization tiers (Free / Pro / Signals)
// Design: Terminal dark, compact tier cards
// - Authenticated users: triggers Stripe checkout for real payments
// - Unauthenticated users: instant plan switch for testing/demo
import { Zap, Star, Crown, CheckCircle, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { usePlan, type PlanTier } from '@/contexts/PlanContext';
import { trpc } from '@/lib/trpc';
import { getLoginUrl } from '@/const';

const TIERS: {
  icon: typeof Zap;
  name: string;
  tier: PlanTier;
  price: string;
  features: string[];
  cta: string;
  color: string;
  borderColor: string;
  bgColor: string;
  activeBg: string;
}[] = [
  {
    icon: Zap,
    name: 'Free',
    tier: 'FREE',
    price: '$0',
    features: ['Unlimited analysis', '1H signal only', 'Trade setup', 'Paper trading'],
    cta: 'Current Plan',
    color: 'text-muted-foreground',
    borderColor: 'border-border',
    bgColor: 'bg-secondary/30',
    activeBg: 'bg-secondary/60 border-foreground/30',
  },
  {
    icon: Star,
    name: 'Pro',
    tier: 'PRO',
    price: '$29/mo',
    features: ['All 4 timeframes', 'Price alerts', 'Saved watchlist', 'P&L equity curve'],
    cta: 'Unlock Pro',
    color: 'text-[oklch(0.78_0.22_155)]',
    borderColor: 'border-[oklch(0.78_0.22_155/0.4)]',
    bgColor: 'bg-[oklch(0.78_0.22_155/0.05)]',
    activeBg: 'bg-[oklch(0.78_0.22_155/0.12)] border-[oklch(0.78_0.22_155/0.6)]',
  },
  {
    icon: Crown,
    name: 'Signals',
    tier: 'SIGNALS',
    price: '$99/mo',
    features: ['Live signal feed', 'Daily briefing', 'Portfolio tracker', 'CSV export'],
    cta: 'Unlock Signals',
    color: 'text-[oklch(0.78_0.18_75)]',
    borderColor: 'border-[oklch(0.78_0.18_75/0.4)]',
    bgColor: 'bg-[oklch(0.78_0.18_75/0.05)]',
    activeBg: 'bg-[oklch(0.78_0.18_75/0.12)] border-[oklch(0.78_0.18_75/0.6)]',
  },
];

export function PricingBanner() {
  const { plan, setPlan, isDbSynced } = usePlan();

  // Auth state
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isAuthenticated = Boolean(user);

  // Stripe checkout mutation
  const createCheckout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err) => {
      toast.error(`Checkout failed: ${err.message}`);
    },
  });

  const handleUpgrade = (tier: PlanTier, name: string) => {
    if (tier === plan) return;

    if (tier === 'FREE') {
      // Downgrade — redirect to billing portal or just notify
      toast.info('To cancel your subscription, use the billing portal.');
      return;
    }

    if (isAuthenticated) {
      // Real Stripe checkout for logged-in users
      createCheckout.mutate({
        plan: tier as 'PRO' | 'SIGNALS',
        successUrl: `${window.location.origin}/?checkout=success&plan=${tier}`,
        cancelUrl: `${window.location.origin}/?checkout=cancel`,
      });
    } else {
      // Dev/demo mode: instant plan switch for unauthenticated users
      setPlan(tier);
      toast.success(`Switched to ${name} plan — demo mode`);
    }
  };

  const isLoading = createCheckout.isPending;

  return (
    <div className="data-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Upgrade for More Alpha</h3>
        {!isAuthenticated && (
          <a
            href={getLoginUrl()}
            className="flex items-center gap-1 text-xs text-primary hover:opacity-80 transition-opacity"
          >
            <LogIn className="w-3 h-3" />
            Sign in
          </a>
        )}
        {isAuthenticated && isDbSynced && (
          <span className="text-xs text-muted-foreground font-mono">Subscription active</span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {TIERS.map(t => {
          const Icon = t.icon;
          const isActive = plan === t.tier;
          const isThisLoading = isLoading && createCheckout.variables?.plan === t.tier;
          return (
            <div
              key={t.name}
              className={`rounded border p-2.5 flex flex-col gap-2 transition-all ${
                isActive ? t.activeBg : `${t.borderColor} ${t.bgColor}`
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Icon className={`w-3.5 h-3.5 ${t.color}`} />
                <span className={`text-xs font-bold ${t.color}`}>{t.name}</span>
                {isActive && <CheckCircle className="w-3 h-3 ml-auto text-green-400" />}
              </div>
              <p className={`font-mono font-bold text-sm ${t.color}`}>{t.price}</p>
              <ul className="space-y-0.5">
                {t.features.map(f => (
                  <li key={f} className="text-[9px] text-muted-foreground leading-tight">
                    · {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleUpgrade(t.tier, t.name)}
                disabled={isActive || isLoading}
                className={`mt-auto text-[10px] font-semibold py-1 rounded border transition-all flex items-center justify-center gap-1 ${
                  isActive
                    ? `${t.borderColor} ${t.color} opacity-60 cursor-default`
                    : `${t.borderColor} ${t.color} hover:opacity-80 active:scale-95 cursor-pointer disabled:opacity-50`
                }`}
              >
                {isThisLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isActive ? (
                  '✓ Active'
                ) : (
                  t.cta
                )}
              </button>
            </div>
          );
        })}
      </div>
      {!isAuthenticated && (
        <p className="text-[9px] text-muted-foreground mt-2 text-center">
          Sign in to subscribe · Demo mode: plans switch instantly
        </p>
      )}
      {isAuthenticated && (
        <p className="text-[9px] text-muted-foreground mt-2 text-center">
          Secure checkout via Stripe · Cancel anytime
        </p>
      )}
    </div>
  );
}
