# CryptoAlpha TODO

## Completed
- [x] Mobile-first UI with terminal-brutalism dark theme
- [x] Core analysis engine: live CoinGecko data, multi-timeframe signals
- [x] Trade setup module: entry/exit targets, stop loss, 1:3+ R:R ratio, position sizing
- [x] Paper trading simulator: $10k virtual portfolio, P&L tracking, trade history
- [x] Breakout watchlist: scans 200 low-cap coins, LONG/SHORT scoring
- [x] Three-tier plan system (FREE/PRO/SIGNALS) with feature gating
- [x] PRO features: all 4 timeframes, price alerts, bookmarks, equity curve
- [x] SIGNALS features: Daily Briefing, Live Signal Feed, Portfolio Tracker, CSV export
- [x] Code review: utilities, CacheService, useDebounce, race condition fixes, accessibility
- [x] Fixed PriceAlertsPanel infinite loop bug
- [x] Fixed usePaperTrading infinite loop bug
- [x] Project upgraded to full-stack (web-db-user)
- [x] Database schema: users table with Stripe fields (stripeCustomerId, stripeSubscriptionId, subscriptionPlan, subscriptionStatus)
- [x] Stripe webhook handler: checkout.session.completed, subscription.updated/deleted, invoice.payment_failed
- [x] Webhook registered before express.json() for raw body preservation

## In Progress
- [x] Stripe tRPC procedure: createCheckoutSession
- [x] Stripe tRPC procedure: getSubscription (get current plan from DB)
- [x] Stripe tRPC procedure: createPortalSession (manage subscription)
- [x] PlanContext: sync plan from DB when user is authenticated
- [x] PricingBanner: wire upgrade buttons to real Stripe checkout
- [x] Handle Stripe success/cancel redirects (URL params + toast)
- [x] PlanSwitcher: show billing portal for authenticated users, dev mode for unauthenticated
- [ ] Stripe product/price IDs configured as env vars (STRIPE_PRICE_PRO, STRIPE_PRICE_SIGNALS)

## Upcoming
- [ ] Trade journal note field when opening paper trades (PRO retention feature)
- [ ] Browser push notifications for price alerts
- [ ] P&L equity curve chart in Paper tab using Recharts


## Core Infrastructure Block (Complete)
- [x] Create/overwrite client/src/lib/supabase.ts with Supabase client
- [x] Create/overwrite client/src/hooks/useWatchlist.ts with persistence hook
- [x] Overwrite client/src/lib/coingecko.ts with direct fetcher (kill corsproxy)
- [x] Overwrite client/src/lib/cache.ts with LRU CacheService
- [x] Overwrite calculateTrueRSI in client/src/lib/analysis.ts
- [x] Overwrite client/src/components/LiveSignalFeed.tsx with canvas rendering
