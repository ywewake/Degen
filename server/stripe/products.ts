/**
 * CryptoAlpha Stripe Products
 * Centralized product/price definitions for Pro and Signals plans.
 */

export type PlanTier = 'FREE' | 'PRO' | 'SIGNALS';

export interface StripeProduct {
  name: string;
  tier: PlanTier;
  priceMonthly: number; // in cents
  description: string;
  features: string[];
  stripePriceId?: string; // populated after product creation in Stripe dashboard
}

export const STRIPE_PRODUCTS: Record<Exclude<PlanTier, 'FREE'>, StripeProduct> = {
  PRO: {
    name: 'CryptoAlpha Pro',
    tier: 'PRO',
    priceMonthly: 2900, // $29.00
    description: 'All 4 timeframe signals, price alerts, saved watchlist, and equity curve.',
    features: [
      'All 4 timeframe signals (1H, 4H, 1D, 1W)',
      'Price alerts with browser notifications',
      'Saved watchlist with 1-tap re-analysis',
      'P&L equity curve chart',
    ],
  },
  SIGNALS: {
    name: 'CryptoAlpha Signals',
    tier: 'SIGNALS',
    priceMonthly: 9900, // $99.00
    description: 'Everything in Pro plus live signal feed, daily briefing, portfolio tracker, and CSV export.',
    features: [
      'Everything in Pro',
      'Live signal feed (auto-refresh)',
      'Coin-specific daily market briefing',
      'Multi-coin portfolio tracker',
      'Export trade history as CSV/JSON',
    ],
  },
};

// Map plan tier to Stripe price lookup key (used in checkout session)
export const PLAN_PRICE_LOOKUP: Record<Exclude<PlanTier, 'FREE'>, string> = {
  PRO: 'cryptoalpha_pro_monthly',
  SIGNALS: 'cryptoalpha_signals_monthly',
};
