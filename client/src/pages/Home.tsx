// CryptoAlpha — Home Page
// Design: Terminal-Brutalism, dark theme, mobile-first single column
// Max-width 480px centered on desktop, feels like a native app

import { useState, useRef, useEffect, useMemo, type ChangeEvent } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { Search, X, TrendingUp, Zap, Shield, ChevronRight, RefreshCw, FlaskConical, Bell, Star, Radio, Newspaper, BarChart3 } from 'lucide-react';
import { useAnalyzer } from '@/hooks/useAnalyzer';
import { usePaperTrading } from '@/hooks/usePaperTrading';
import { usePlan } from '@/contexts/PlanContext';
import { TokenomicsCard } from '@/components/TokenomicsCard';
import { SignalsGrid } from '@/components/SignalsGrid';
import { SentimentGauge } from '@/components/SentimentGauge';
import { RiskCard } from '@/components/RiskCard';
import { ActionPlanCard } from '@/components/ActionPlanCard';
import { TradeSetupCard } from '@/components/TradeSetupCard';
import { PaperTradingPanel } from '@/components/PaperTradingPanel';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { PricingBanner } from '@/components/PricingBanner';
import { BreakoutWatchlist } from '@/components/BreakoutWatchlist';
import { PlanSwitcher, PlanBadge } from '@/components/PlanSwitcher';
import { FeatureGate } from '@/components/FeatureGate';
import { PriceAlertsPanel } from '@/components/PriceAlertsPanel';
import { SavedWatchlist, BookmarkButton, useWatchlist } from '@/components/SavedWatchlist';
import { EquityCurve } from '@/components/EquityCurve';
import { LiveSignalFeed } from '@/components/LiveSignalFeed';
import { DailyBriefing } from '@/components/DailyBriefing';
import { PortfolioTracker } from '@/components/PortfolioTracker';
import { ExportHistory } from '@/components/ExportHistory';
import { toast } from 'sonner';
import type { TradeSetup } from '@/services/tradeSetup';

const HERO_BG = 'https://d2xsxph8kpxj0f.cloudfront.net/106413730/gwuuY9iwSPPRWN6khUCJ3y/hero-bg-5obX6UjuNshPYfMUnc3XMY.webp';

const QUICK_PICKS = ['BTC', 'ETH', 'SOL', 'BNB', 'DOGE'];

export default function Home() {
  const { state, result, error, searchResults, isSearching, analyze, search, reset } = useAnalyzer();
  const { portfolio, enterTrade, exitTrade, refreshPrices, reset: resetPortfolio, adjustBalance } = usePaperTrading();
  const { plan, can } = usePlan();
  const watchlist = useWatchlist();

  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<'analysis' | 'trade' | 'paper' | 'intel'>('analysis');
  const [homeTab, setHomeTab] = useState<'watchlist' | 'signals' | 'features'>('watchlist');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isTyping = useRef(false);

  const debouncedQuery = useDebounce(query, 350);

  // Handle Stripe checkout redirect — ?checkout=success&plan=PRO or ?checkout=cancel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');
    const planParam = params.get('plan');
    if (checkoutStatus === 'success') {
      toast.success(
        planParam === 'SIGNALS'
          ? '👑 Signals plan activated! Live feed, daily briefings, and portfolio tracker are now unlocked.'
          : '⭐ Pro plan activated! All timeframes, price alerts, and equity curve are now unlocked.',
        { duration: 6000 }
      );
      // Clean up URL params without page reload
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      url.searchParams.delete('plan');
      window.history.replaceState({}, '', url.toString());
    } else if (checkoutStatus === 'cancel') {
      toast.info('Checkout cancelled. Your plan has not changed.');
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    isTyping.current = true;
    setQuery(e.target.value.toUpperCase());
  };

  useEffect(() => {
    if (debouncedQuery.length >= 2 && isTyping.current) {
      search(debouncedQuery);
      setShowDropdown(true);
    } else if (debouncedQuery.length < 2) {
      setShowDropdown(false);
    }
  }, [debouncedQuery, search]);

  // Update paper trade prices when result changes
  useEffect(() => {
    if (result) {
      refreshPrices(result.coinId, result.price);
    }
  }, [result, refreshPrices]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      toast.error('Enter a ticker symbol to analyze');
      return;
    }
    setShowDropdown(false);
    isTyping.current = false;
    analyze(query.trim());
  };

  const handleSelectResult = (id: string, symbol: string) => {
    setQuery(symbol);
    setShowDropdown(false);
    isTyping.current = false;
    analyze(id);
  };

  const handleQuickPick = (ticker: string) => {
    setQuery(ticker);
    setShowDropdown(false);
    isTyping.current = false;
    analyze(ticker);
  };

  const handleClear = () => {
    setQuery('');
    reset();
    setShowDropdown(false);
    setActiveTab('analysis');
    inputRef.current?.focus();
  };

  const handleRefresh = () => {
    if (result) analyze(result.coinId);
  };

  const handleWatchlistAnalyze = (coinId: string) => {
    setQuery(coinId.toUpperCase());
    analyze(coinId);
  };

  const handleEnterTrade = (setup: TradeSetup) => {
    if (!result) return;
    enterTrade(setup, result.coinId, result.ticker, result.name, result.image, result.price);
    toast.success(`Paper trade opened: ${setup.direction} ${result.ticker.toUpperCase()} @ $${setup.entryPrice.toFixed(4)}`);
    setActiveTab('paper');
  };

  const handleCloseTrade = (tradeId: string, exitPrice: number) => {
    exitTrade(tradeId, exitPrice);
    toast.success(`Trade closed at $${exitPrice.toFixed(4)}`);
  };

  const handleResetPortfolio = (startingBalance?: number) => {
    resetPortfolio(startingBalance);
    toast.success(`Paper portfolio reset to $${(startingBalance ?? 10000).toLocaleString()}`);
  };

  const handleAdjustBalance = (newBalance: number) => {
    adjustBalance(newBalance);
  };

  const showResults = state === 'success' && result;
  const showLoading = state === 'loading';
  const showError = state === 'error';
  const showWelcome = state === 'idle';

  const openTradesCount = portfolio.trades.filter(t => t.status === 'OPEN').length;

  // Current coin info for PRO features — memoized to prevent infinite re-renders in child effects
  const currentCoin = useMemo(() => result ? {
    id: result.coinId,
    symbol: result.ticker.toUpperCase(),
    name: result.name,
    image: result.image ?? '',
    price: result.price,
    priceChange24h: result.priceChange24h ?? 0,
  } : null, [result?.coinId, result?.ticker, result?.name, result?.image, result?.price, result?.priceChange24h]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm w-full">
        <div className="container">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" />
              </div>
              <span className="font-bold text-foreground tracking-tight text-sm">
                CRYPTO<span className="text-primary">ALPHA</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {showResults && (
                <button
                  onClick={handleRefresh}
                  aria-label="Refresh analysis data"
                  className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
              {/* Paper trading indicator */}
              {openTradesCount > 0 && (
                <button
                  onClick={() => setActiveTab('paper')}
                  aria-label={`${openTradesCount} open paper trades`}
                  className="flex items-center gap-1 text-xs font-mono font-bold px-2 py-1 rounded border border-[oklch(0.78_0.18_75)]/40 bg-[oklch(0.78_0.18_75)]/10 text-[oklch(0.78_0.18_75)] hover:bg-[oklch(0.78_0.18_75)]/20 transition-colors"
                >
                  <FlaskConical className="w-3 h-3" />
                  {openTradesCount}
                </button>
              )}
              {/* Plan badge */}
              <PlanBadge />
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero / Search ─────────────────────────────────────── */}
      <div
        className="relative border-b border-border w-full"
        style={{
          backgroundImage: showWelcome ? `url(${HERO_BG})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {showWelcome && (
          <div className="absolute inset-0 bg-background/85 backdrop-blur-[2px]" />
        )}
        <div className="relative container py-6">
          {showWelcome && (
            <div className="mb-5 text-center">
              <h1 className="text-2xl font-bold text-foreground leading-tight">
                Instant Crypto Alpha
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Signals · Trade Setup · Paper Trading
              </p>
            </div>
          )}

          {/* Search bar */}
          <div className="relative" ref={dropdownRef}>
            <form onSubmit={handleSubmit}>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    placeholder="BTC, ETH, SOL..."
                    aria-label="Search for a cryptocurrency by ticker symbol"
                    aria-autocomplete="list"
                    aria-expanded={showDropdown && searchResults.length > 0}
                    role="combobox"
                    className="w-full h-11 pl-9 pr-9 bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground font-mono text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={showLoading}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={handleClear}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={showLoading}
                  aria-label="Analyze cryptocurrency"
                  className="h-11 px-5 bg-primary text-primary-foreground rounded font-semibold text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {showLoading ? '...' : 'Analyze'}
                </button>
              </div>
            </form>

            {/* Autocomplete dropdown */}
            {showDropdown && (searchResults.length > 0 || isSearching) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                {isSearching && searchResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground font-mono">Searching...</div>
                )}
                {searchResults.map(coin => (
                  <button
                    key={coin.id}
                    type="button"
                    onClick={() => handleSelectResult(coin.id, coin.symbol)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary transition-colors text-left"
                  >
                    <span className="font-mono font-bold text-primary text-sm w-14 shrink-0">
                      {coin.symbol}
                    </span>
                    <span className="text-foreground text-sm truncate">{coin.name}</span>
                    {coin.market_cap_rank && (
                      <span className="ml-auto text-xs text-muted-foreground font-mono shrink-0">
                        #{coin.market_cap_rank}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick picks */}
          {showWelcome && (
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Quick:</span>
              {QUICK_PICKS.map(ticker => (
                <button
                  key={ticker}
                  onClick={() => handleQuickPick(ticker)}
                  className="text-xs font-mono font-medium px-2.5 py-1 rounded border border-border bg-secondary text-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  {ticker}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <main className="flex-1 container py-4">
        {showLoading && <LoadingState ticker={query} />}
        {showError && <ErrorState message={error!} onRetry={() => analyze(query)} />}

        {showResults && (
          <>
            {/* Tab navigation */}
            <div className="flex border border-border rounded overflow-hidden mb-4 text-xs font-mono font-bold">
              <button
                onClick={() => setActiveTab('analysis')}
                aria-pressed={activeTab === 'analysis'}
                className={`flex-1 py-2.5 transition-colors ${
                  activeTab === 'analysis'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Analysis
              </button>
              <button
                onClick={() => setActiveTab('trade')}
                aria-pressed={activeTab === 'trade'}
                className={`flex-1 py-2.5 transition-colors border-x border-border ${
                  activeTab === 'trade'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Trade
              </button>
              <button
                onClick={() => setActiveTab('paper')}
                aria-pressed={activeTab === 'paper'}
                className={`flex-1 py-2.5 transition-colors relative border-r border-border ${
                  activeTab === 'paper'
                    ? 'bg-[oklch(0.78_0.18_75)]/15 text-[oklch(0.78_0.18_75)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Paper
                {openTradesCount > 0 && (
                  <span className="absolute top-1.5 right-2 w-3.5 h-3.5 rounded-full bg-[oklch(0.78_0.18_75)] text-background text-[8px] font-bold flex items-center justify-center">
                    {openTradesCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('intel')}
                aria-pressed={activeTab === 'intel'}
                aria-label="Intel tab — Signals plan features"
                className={`flex-1 py-2.5 transition-colors relative ${
                  activeTab === 'intel'
                    ? 'bg-[oklch(0.78_0.18_75)]/15 text-[oklch(0.78_0.18_75)]'
                    : can('liveSignalFeed')
                    ? 'text-[oklch(0.78_0.18_75)]/70 hover:text-[oklch(0.78_0.18_75)]'
                    : 'text-muted-foreground/40 hover:text-muted-foreground'
                }`}
              >
                Intel
                {!can('liveSignalFeed') && (
                  <span className="absolute top-1 right-1 text-[8px] text-[oklch(0.78_0.18_75)]/60">★</span>
                )}
              </button>
            </div>

            {/* Analysis Tab */}
            {activeTab === 'analysis' && (
              <div className="space-y-3 stagger">
                {/* TokenomicsCard with PRO bookmark button */}
                <div className="card-enter relative">
                  <TokenomicsCard result={result} />
                  {can('savedWatchlist') && currentCoin && (
                    <div className="absolute top-3 right-3">
                      <BookmarkButton
                        coinId={currentCoin.id}
                        symbol={currentCoin.symbol}
                        name={currentCoin.name}
                        image={currentCoin.image}
                        price={currentCoin.price}
                        priceChange24h={currentCoin.priceChange24h}
                        watchlist={watchlist}
                      />
                    </div>
                  )}
                </div>

                {/* Signals — PRO unlocks all 4 timeframes (SignalsGrid handles locking internally) */}
                <div className="card-enter">
                  <SignalsGrid signals={result.signals} dominantSignal={result.dominantSignal} />
                </div>

                <div className="grid grid-cols-2 gap-3 card-enter">
                  <SentimentGauge sentiment={result.sentiment} />
                  <RiskCard risk={result.risk} />
                </div>

                <div className="card-enter">
                  <ActionPlanCard
                    plan={result.actionPlan}
                    signal={result.dominantSignal}
                    risk={result.risk.level}
                  />
                </div>

                {/* PRO: Price Alerts */}
                <div className="card-enter">
                  <FeatureGate feature="priceAlerts" label="Price Alerts — Pro feature">
                    <PriceAlertsPanel currentCoin={currentCoin} />
                  </FeatureGate>
                </div>

                {/* Plan switcher / pricing */}
                {plan === 'FREE' ? (
                  <div className="card-enter">
                    <PricingBanner />
                  </div>
                ) : (
                  <div className="card-enter">
                    <PlanSwitcher />
                  </div>
                )}

                <p className="text-center text-xs text-muted-foreground font-mono pb-2">
                  Data via CoinGecko · {new Date(result.timestamp).toLocaleTimeString()}
                </p>
              </div>
            )}

            {/* Trade Setup Tab */}
            {activeTab === 'trade' && (
              <div className="space-y-3">
                {/* Mini tokenomics header */}
                <div className="flex items-center justify-between px-3 py-2 rounded border border-border bg-secondary/30">
                  <div className="flex items-center gap-2">
                    {result.image && (
                      <img src={result.image} alt={result.ticker} className="w-5 h-5 rounded-full" />
                    )}
                    <span className="text-xs font-bold font-mono text-foreground">{result.ticker.toUpperCase()}</span>
                    <span className="text-xs text-muted-foreground">{result.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono text-foreground">
                      ${result.price.toLocaleString('en-US', { maximumFractionDigits: result.price < 1 ? 6 : 2 })}
                    </div>
                    {result.priceChange24h != null && (
                      <div className={`text-[10px] font-mono ${result.priceChange24h >= 0 ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                        {result.priceChange24h >= 0 ? '+' : ''}{result.priceChange24h.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>

                <TradeSetupCard result={result} onEnterTrade={handleEnterTrade} />

                <p className="text-center text-[10px] text-muted-foreground/60 font-mono pb-2">
                  ⚠ Not financial advice. Paper trading only — no real funds at risk.
                </p>
              </div>
            )}

            {/* Paper Trading Tab */}
            {activeTab === 'paper' && (
              <div className="space-y-3">
                <PaperTradingPanel
                  portfolio={portfolio}
                  currentPrice={result.price}
                  onClose={handleCloseTrade}
                  onReset={handleResetPortfolio}
                  onAdjustBalance={handleAdjustBalance}
                />

                {/* PRO: Equity Curve */}
                <FeatureGate feature="equityCurve" label="Equity Curve — Pro feature">
                  <EquityCurve portfolio={portfolio} />
                </FeatureGate>

                {/* SIGNALS: Export History */}
                <FeatureGate feature="exportHistory" label="Export Trade History — Signals feature">
                  <ExportHistory portfolio={portfolio} />
                </FeatureGate>

                {openTradesCount === 0 && (
                  <button
                    onClick={() => setActiveTab('trade')}
                    className="w-full py-3 rounded border border-dashed border-border text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                  >
                    ↑ Go to Trade Setup to open a paper trade
                  </button>
                )}

                {/* Plan switcher for testing */}
                {plan !== 'FREE' && (
                  <PlanSwitcher />
                )}
              </div>
            )}

            {/* Intel Tab — SIGNALS plan features */}
            {activeTab === 'intel' && (
              <div className="space-y-3">
                {can('liveSignalFeed') ? (
                  <>
                    <DailyBriefing currentResult={result} />
                    <LiveSignalFeed dataPoints={[]} signalType="neutral" />
                    <PortfolioTracker />
                  </>
                ) : (
                  <div className="data-card p-6 text-center space-y-3">
                    <div className="text-3xl">★</div>
                    <p className="text-sm font-bold text-foreground">Signals Plan Required</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Unlock the Daily Briefing, Live Signal Feed, and Portfolio Tracker.
                    </p>
                    <div className="space-y-2 text-left mt-3">
                      {['Coin-specific daily briefing', 'Live signal feed (auto-refresh)', 'Multi-coin portfolio tracker', 'CSV export of trade history'].map(f => (
                        <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="text-[oklch(0.78_0.18_75)]">✓</span> {f}
                        </div>
                      ))}
                    </div>
                    <PlanSwitcher />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Welcome state */}
        {showWelcome && (
          <div className="space-y-4 mt-2">
            {/* Home tab switcher */}
            <div className="flex border border-border rounded overflow-hidden text-xs font-mono font-bold">
              <button
                onClick={() => setHomeTab('watchlist')}
                aria-pressed={homeTab === 'watchlist'}
                className={`flex-1 py-2.5 transition-colors flex items-center justify-center gap-1.5 ${
                  homeTab === 'watchlist'
                    ? 'bg-[oklch(0.78_0.18_75)]/15 text-[oklch(0.78_0.18_75)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Breakouts
              </button>
              <button
                onClick={() => setHomeTab('signals')}
                aria-pressed={homeTab === 'signals'}
                className={`flex-1 py-2.5 transition-colors border-x border-border flex items-center justify-center gap-1.5 ${
                  homeTab === 'signals'
                    ? 'bg-[oklch(0.78_0.18_75)]/15 text-[oklch(0.78_0.18_75)]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Signals
              </button>
              <button
                onClick={() => setHomeTab('features')}
                aria-pressed={homeTab === 'features'}
                className={`flex-1 py-2.5 transition-colors ${
                  homeTab === 'features'
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Plans
              </button>
            </div>

            {homeTab === 'watchlist' && (
              <BreakoutWatchlist onAnalyze={handleWatchlistAnalyze} />
            )}

            {homeTab === 'signals' && (
              <div className="space-y-3">
                {/* SIGNALS: Daily Briefing */}
                <FeatureGate feature="dailyBriefing" label="Daily Market Briefing — Signals feature">
                  <DailyBriefing currentResult={result} />
                </FeatureGate>

                {/* SIGNALS: Live Signal Feed */}
                <FeatureGate feature="liveSignalFeed" label="Live Signal Feed — Signals feature">
                  <LiveSignalFeed dataPoints={[]} signalType="neutral" />
                </FeatureGate>
              </div>
            )}

            {homeTab === 'features' && (
              <div className="space-y-3">
                <PlanSwitcher />

                {/* PRO: Saved Watchlist */}
                <FeatureGate feature="savedWatchlist" label="Saved Watchlist — Pro feature">
                  <SavedWatchlist onAnalyze={handleWatchlistAnalyze} watchlist={watchlist} />
                </FeatureGate>

                {/* SIGNALS: Portfolio Tracker */}
                <FeatureGate feature="portfolioTracker" label="Portfolio Tracker — Signals feature">
                  <PortfolioTracker currentCoin={currentCoin} />
                </FeatureGate>

                <FeatureGrid />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function FeatureGrid() {
  const features = [
    {
      icon: <TrendingUp className="w-5 h-5 text-primary" />,
      title: 'Multi-Timeframe Signals',
      desc: '1h, 4h, 1d, 1w momentum signals with trend direction',
      plan: 'FREE',
    },
    {
      icon: <Zap className="w-5 h-5 text-[oklch(0.78_0.18_75)]" />,
      title: 'Trade Setup',
      desc: 'Auto-calculated entry, TP1/TP2/TP3, stop loss, 1:3+ R:R',
      plan: 'FREE',
    },
    {
      icon: <Shield className="w-5 h-5 text-[oklch(0.65_0.22_27)]" />,
      title: 'Risk Rating',
      desc: 'Volatility, market cap, and liquidity risk in one score',
      plan: 'FREE',
    },
    {
      icon: <FlaskConical className="w-5 h-5 text-[oklch(0.78_0.18_75)]" />,
      title: 'Paper Trading',
      desc: 'Test your strategy with virtual portfolio, no risk',
      plan: 'FREE',
    },
    {
      icon: <Bell className="w-5 h-5 text-[oklch(0.78_0.22_155)]" />,
      title: 'Price Alerts',
      desc: 'Set above/below alerts on any analyzed coin',
      plan: 'PRO',
    },
    {
      icon: <Star className="w-5 h-5 text-[oklch(0.78_0.22_155)]" />,
      title: 'Saved Watchlist',
      desc: 'Bookmark coins and re-analyze with one tap',
      plan: 'PRO',
    },
    {
      icon: <Radio className="w-5 h-5 text-[oklch(0.78_0.18_75)]" />,
      title: 'Live Signal Feed',
      desc: 'Real-time BUY/SELL signals across 8 major coins',
      plan: 'SIGNALS',
    },
    {
      icon: <Newspaper className="w-5 h-5 text-[oklch(0.78_0.18_75)]" />,
      title: 'Daily Briefing',
      desc: 'AI-style market briefing with key levels and opportunities',
      plan: 'SIGNALS',
    },
    {
      icon: <BarChart3 className="w-5 h-5 text-[oklch(0.78_0.18_75)]" />,
      title: 'Portfolio Tracker',
      desc: 'Multi-coin portfolio with live P&L tracking',
      plan: 'SIGNALS',
    },
    {
      icon: <ChevronRight className="w-5 h-5 text-[oklch(0.78_0.18_75)]" />,
      title: 'Export History',
      desc: 'Download trade history as CSV or JSON',
      plan: 'SIGNALS',
    },
  ];

  const PLAN_COLORS: Record<string, string> = {
    FREE: 'text-muted-foreground',
    PRO: 'text-[oklch(0.78_0.22_155)]',
    SIGNALS: 'text-[oklch(0.78_0.18_75)]',
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {features.map((f, i) => (
        <div
          key={i}
          className="data-card p-4 space-y-2"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-start justify-between">
            <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center">
              {f.icon}
            </div>
            <span className={`text-[9px] font-mono font-bold ${PLAN_COLORS[f.plan]}`}>{f.plan}</span>
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">{f.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}
