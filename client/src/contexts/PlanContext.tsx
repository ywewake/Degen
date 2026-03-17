// CryptoAlpha — Plan Context
// Manages the user's subscription tier (FREE / PRO / SIGNALS).
// When user is authenticated, syncs plan from the database (set by Stripe webhooks).
// When user is not authenticated, falls back to localStorage for testing.

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { trpc } from '@/lib/trpc';

export type PlanTier = 'FREE' | 'PRO' | 'SIGNALS';

export interface PlanFeatures {
  // FREE
  basicAnalysis: boolean;
  paperTrading: boolean;
  quickPicks: boolean;
  breakoutWatchlist: boolean;

  // PRO
  allTimeframes: boolean;       // 4 timeframes unlocked (FREE = 1h only)
  priceAlerts: boolean;         // Set price alerts on any coin
  savedWatchlist: boolean;      // Save coins to personal watchlist
  tradeJournal: boolean;        // Add notes to paper trades
  equityCurve: boolean;         // P&L equity curve chart
  signalHistory: boolean;       // Last 30 days of signals per coin
  advancedRisk: boolean;        // Detailed risk breakdown sub-scores

  // SIGNALS
  liveSignalFeed: boolean;      // Real-time signal feed across all tracked coins
  portfolioTracker: boolean;    // Multi-coin portfolio with live P&L
  dailyBriefing: boolean;       // AI-style daily market briefing
  exportHistory: boolean;       // Export trade history as CSV
  whaleAlerts: boolean;         // Simulated whale movement alerts
  apiAccess: boolean;           // API key for programmatic access
}

const PLAN_FEATURES: Record<PlanTier, PlanFeatures> = {
  FREE: {
    basicAnalysis: true,
    paperTrading: true,
    quickPicks: true,
    breakoutWatchlist: true,
    allTimeframes: false,
    priceAlerts: false,
    savedWatchlist: false,
    tradeJournal: false,
    equityCurve: false,
    signalHistory: false,
    advancedRisk: false,
    liveSignalFeed: false,
    portfolioTracker: false,
    dailyBriefing: false,
    exportHistory: false,
    whaleAlerts: false,
    apiAccess: false,
  },
  PRO: {
    basicAnalysis: true,
    paperTrading: true,
    quickPicks: true,
    breakoutWatchlist: true,
    allTimeframes: true,
    priceAlerts: true,
    savedWatchlist: true,
    tradeJournal: true,
    equityCurve: true,
    signalHistory: true,
    advancedRisk: true,
    liveSignalFeed: false,
    portfolioTracker: false,
    dailyBriefing: false,
    exportHistory: false,
    whaleAlerts: false,
    apiAccess: false,
  },
  SIGNALS: {
    basicAnalysis: true,
    paperTrading: true,
    quickPicks: true,
    breakoutWatchlist: true,
    allTimeframes: true,
    priceAlerts: true,
    savedWatchlist: true,
    tradeJournal: true,
    equityCurve: true,
    signalHistory: true,
    advancedRisk: true,
    liveSignalFeed: true,
    portfolioTracker: true,
    dailyBriefing: true,
    exportHistory: true,
    whaleAlerts: true,
    apiAccess: true,
  },
};

const PLAN_PRICES: Record<PlanTier, string> = {
  FREE: 'Free',
  PRO: '$29/mo',
  SIGNALS: '$99/mo',
};

const STORAGE_KEY = 'cryptoalpha:plan';

interface PlanContextValue {
  plan: PlanTier;
  features: PlanFeatures;
  price: string;
  setPlan: (tier: PlanTier) => void;
  can: (feature: keyof PlanFeatures) => boolean;
  requiresPro: (feature: keyof PlanFeatures) => boolean;
  requiresSignals: (feature: keyof PlanFeatures) => boolean;
  /** True when the plan is synced from the database (user is logged in) */
  isDbSynced: boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

function loadStoredPlan(): PlanTier {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'FREE' || stored === 'PRO' || stored === 'SIGNALS') return stored;
  } catch { /* ignore */ }
  return 'FREE';
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlanState] = useState<PlanTier>(loadStoredPlan);
  const [isDbSynced, setIsDbSynced] = useState(false);

  // Fetch subscription from database — works for both authenticated and anonymous users
  const { data: subscriptionData } = trpc.stripe.getSubscription.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000, // Re-check every 30s
  });

  // Sync plan from database when subscription data is available
  useEffect(() => {
    if (subscriptionData?.plan) {
      const dbPlan = subscriptionData.plan;
      setPlanState(dbPlan);
      try { localStorage.setItem(STORAGE_KEY, dbPlan); } catch { /* ignore */ }
      setIsDbSynced(true);
    }
  }, [subscriptionData?.plan]);

  const setPlan = useCallback((tier: PlanTier) => {
    // Only allow local override when NOT synced from DB
    // (i.e., user is not logged in — dev/test mode)
    if (!isDbSynced) {
      setPlanState(tier);
      try { localStorage.setItem(STORAGE_KEY, tier); } catch { /* ignore */ }
    }
  }, [isDbSynced]);

  const features = PLAN_FEATURES[plan];

  const can = useCallback(
    (feature: keyof PlanFeatures) => features[feature],
    [features]
  );

  const requiresPro = useCallback(
    (feature: keyof PlanFeatures) => PLAN_FEATURES.PRO[feature] && !features[feature],
    [features]
  );

  const requiresSignals = useCallback(
    (feature: keyof PlanFeatures) => PLAN_FEATURES.SIGNALS[feature] && !features[feature],
    [features]
  );

  return (
    <PlanContext.Provider value={{ plan, features, price: PLAN_PRICES[plan], setPlan, can, requiresPro, requiresSignals, isDbSynced }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error('usePlan must be used inside PlanProvider');
  return ctx;
}

export { PLAN_FEATURES, PLAN_PRICES };
