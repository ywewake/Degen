// CryptoAlpha — Daily Briefing (SIGNALS Plan Feature)
// Design: Terminal-Brutalism dark theme
// Coin-specific briefing: uses the currently analyzed coin's live data.
// Falls back to BTC if no coin has been analyzed yet.

import { useState, useEffect, useCallback } from 'react';
import { Newspaper, RefreshCw, TrendingUp, TrendingDown, Minus, AlertTriangle, Target } from 'lucide-react';
import { getMarketData } from '@/services/coingecko';
import { analyzeMarketData } from '@/services/analysis';
import type { AnalysisResult } from '@/services/analysis';

interface BriefingData {
  date: string;
  coinSymbol: string;
  coinName: string;
  price: number;
  priceChange24h: number;
  marketBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  headline: string;
  supportLevel: number;
  resistanceLevel: number;
  opportunity: string;
  riskWatch: string;
  dominantSignal: string;
  sentimentScore: number;
  riskLevel: string;
  generatedAt: number;
}

function buildBriefing(result: AnalysisResult): BriefingData {
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const sym = result.ticker.toUpperCase();
  const price = result.price;
  const change = result.priceChange24h ?? 0;
  const sig = result.dominantSignal;
  const risk = result.risk.level;
  const sentiment = result.sentiment.score;
  const vol = result.risk.volatility;

  const marketBias: BriefingData['marketBias'] =
    sig === 'BUY' ? 'BULLISH' : sig === 'SELL' ? 'BEARISH' : 'NEUTRAL';

  const support = price * (1 - Math.max(vol * 0.4, 0.02));
  const resistance = price * (1 + Math.max(vol * 0.4, 0.02));
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 2 });

  const headlines: Record<string, string[]> = {
    BUY: [
      `${sym} showing bullish momentum — buyers in control at $${fmt(price)}`,
      `${sym} breaking higher with ${change >= 0 ? '+' : ''}${change.toFixed(2)}% 24h — watch resistance at $${fmt(resistance)}`,
      `${sym} accumulation phase detected — price momentum score ${sentiment}/100 signals strength`,
    ],
    SELL: [
      `${sym} under distribution pressure — sellers dominating at $${fmt(price)}`,
      `${sym} showing weakness with ${change.toFixed(2)}% 24h decline — support at $${fmt(support)} critical`,
      `${sym} momentum fading — price momentum score ${sentiment}/100 signals caution`,
    ],
    NEUTRAL: [
      `${sym} range-bound at $${fmt(price)} — wait for directional break`,
      `${sym} consolidating between $${fmt(support)} and $${fmt(resistance)}`,
      `${sym} at decision point — price momentum score ${sentiment}/100 neutral`,
    ],
  };

  const opportunities: Record<string, string[]> = {
    BUY: [
      `Look for pullbacks to $${fmt(price * 0.97)} as entry. Momentum supports continuation toward $${fmt(resistance)}.`,
      `${sym} long setup valid above $${fmt(price * 0.985)}. Target $${fmt(price * 1.05)} with stop below $${fmt(support)}.`,
    ],
    SELL: [
      `Short opportunity if ${sym} fails to reclaim $${fmt(price * 1.02)}. Target $${fmt(support)} with tight stop.`,
      `Watch for dead-cat bounce to $${fmt(price * 1.015)} as short entry. Downside target $${fmt(price * 0.93)}.`,
    ],
    NEUTRAL: [
      `Wait for ${sym} to break above $${fmt(resistance)} or below $${fmt(support)} before entering.`,
      `Scalp opportunities on both sides of the range. Reduce size until direction is confirmed.`,
    ],
  };

  const riskWatches: Record<string, string[]> = {
    HIGH: [
      `${sym} is HIGH RISK — position size max 1%. Volatility elevated; use wider stops.`,
      `High volatility on ${sym}. Avoid overleveraging; market can move 10%+ intraday.`,
    ],
    MEDIUM: [
      `${sym} carries MEDIUM RISK. Standard position sizing applies. Monitor volume for confirmation.`,
      `Watch for sudden volume spikes on ${sym} — could signal a breakout or breakdown.`,
    ],
    LOW: [
      `${sym} is LOW RISK with stable price action. Larger position sizes are acceptable.`,
      `${sym} showing low volatility — good for swing trades with wider targets.`,
    ],
  };

  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const sigKey = sig as string;

  return {
    date,
    coinSymbol: sym,
    coinName: result.name,
    price,
    priceChange24h: change,
    marketBias,
    headline: pick(headlines[sigKey] ?? headlines.NEUTRAL),
    supportLevel: support,
    resistanceLevel: resistance,
    opportunity: pick(opportunities[sigKey] ?? opportunities.NEUTRAL),
    riskWatch: pick(riskWatches[risk] ?? riskWatches.MEDIUM),
    dominantSignal: sig,
    sentimentScore: sentiment,
    riskLevel: risk,
    generatedAt: Date.now(),
  };
}

const BIAS_CONFIG = {
  BULLISH: {
    icon: TrendingUp,
    text: 'text-[oklch(0.78_0.22_155)]',
    bg: 'bg-[oklch(0.78_0.22_155/0.1)]',
    border: 'border-[oklch(0.78_0.22_155/0.3)]',
    label: 'BULLISH BIAS',
  },
  BEARISH: {
    icon: TrendingDown,
    text: 'text-[oklch(0.65_0.22_27)]',
    bg: 'bg-[oklch(0.65_0.22_27/0.1)]',
    border: 'border-[oklch(0.65_0.22_27/0.3)]',
    label: 'BEARISH BIAS',
  },
  NEUTRAL: {
    icon: Minus,
    text: 'text-[oklch(0.78_0.18_75)]',
    bg: 'bg-[oklch(0.78_0.18_75/0.08)]',
    border: 'border-[oklch(0.78_0.18_75/0.25)]',
    label: 'NEUTRAL BIAS',
  },
};

interface Props {
  currentResult?: AnalysisResult | null;
}

export function DailyBriefing({ currentResult }: Props) {
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch BTC as fallback if no coin analyzed yet
  const fetchFallback = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMarketData('bitcoin');
      const analysis = analyzeMarketData(data);
      const result: AnalysisResult = {
        coinId: 'bitcoin',
        ticker: 'BTC',
        name: 'Bitcoin',
        image: data.image ?? '',
        price: data.current_price,
        priceChange24h: data.price_change_percentage_24h ?? 0,
        priceChange7d: data.price_change_percentage_7d_in_currency ?? null,
        marketCap: data.market_cap ?? 0,
        fdv: data.fully_diluted_valuation ?? null,
        volume24h: data.total_volume ?? 0,
        ath: data.ath ?? 0,
        athChangePercent: data.ath_change_percentage ?? 0,
        circulatingSupply: data.circulating_supply ?? 0,
        totalSupply: data.total_supply ?? null,
        maxSupply: data.max_supply ?? null,
        marketCapRank: data.market_cap_rank ?? null,
        high24h: data.high_24h ?? 0,
        low24h: data.low_24h ?? 0,
        signals: analysis.signals,
        dominantSignal: analysis.dominantSignal,
        sentiment: analysis.sentiment,
        risk: analysis.risk,
        actionPlan: analysis.actionPlan,
        timestamp: Date.now(),
      };
      setBriefing(buildBriefing(result));
    } catch {
      setError('Failed to generate briefing. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentResult) {
      setBriefing(buildBriefing(currentResult));
    } else if (!briefing && !loading) {
      fetchFallback();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentResult]);

  const handleRefresh = () => {
    if (currentResult) {
      setBriefing(buildBriefing(currentResult));
    } else {
      fetchFallback();
    }
  };

  if (loading) {
    return (
      <div className="data-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Newspaper className="w-4 h-4 text-[oklch(0.78_0.18_75)]" />
          <span className="text-sm font-semibold text-foreground">Daily Briefing</span>
        </div>
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-xs font-mono">Generating briefing...</span>
        </div>
      </div>
    );
  }

  if (error || !briefing) {
    return (
      <div className="data-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Newspaper className="w-4 h-4 text-[oklch(0.78_0.18_75)]" />
          <span className="text-sm font-semibold text-foreground">Daily Briefing</span>
        </div>
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground font-mono">{error ?? 'No briefing available'}</p>
          <button onClick={handleRefresh} className="mt-2 text-xs font-mono text-primary hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  const bc = BIAS_CONFIG[briefing.marketBias];
  const BiasIcon = bc.icon;
  const isUp = briefing.priceChange24h >= 0;
  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 2 });

  return (
    <div className="data-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-[oklch(0.78_0.18_75)]" />
          <div>
            <span className="text-sm font-semibold text-foreground">Daily Briefing</span>
            <div className="text-[9px] font-mono text-muted-foreground">{briefing.date} · {briefing.coinName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono bg-[oklch(0.78_0.18_75/0.1)] text-[oklch(0.78_0.18_75)] border border-[oklch(0.78_0.18_75/0.3)] rounded px-1.5 py-0.5">SIGNALS</span>
          <button onClick={handleRefresh} aria-label="Refresh daily briefing" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Coin + Bias */}
        <div className={`flex items-start gap-3 p-3 rounded border ${bc.bg} ${bc.border}`}>
          <BiasIcon className={`w-4 h-4 mt-0.5 shrink-0 ${bc.text}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-mono font-bold ${bc.text}`}>{bc.label}</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {briefing.coinSymbol} · ${fmt(briefing.price)}
                <span className={`ml-1 ${isUp ? 'text-[oklch(0.78_0.22_155)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                  {isUp ? '+' : ''}{briefing.priceChange24h.toFixed(2)}%
                </span>
              </span>
            </div>
            <p className="text-xs text-foreground leading-relaxed">{briefing.headline}</p>
          </div>
        </div>

        {/* Key Levels */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded border border-border bg-secondary/20">
            <div className="text-[9px] font-mono text-muted-foreground mb-1 uppercase tracking-wide">Support</div>
            <div className="text-sm font-mono font-bold text-[oklch(0.78_0.22_155)]">${fmt(briefing.supportLevel)}</div>
          </div>
          <div className="p-2.5 rounded border border-border bg-secondary/20">
            <div className="text-[9px] font-mono text-muted-foreground mb-1 uppercase tracking-wide">Resistance</div>
            <div className="text-sm font-mono font-bold text-[oklch(0.65_0.22_27)]">${fmt(briefing.resistanceLevel)}</div>
          </div>
        </div>

        {/* Top Opportunity */}
        <div className="p-3 rounded border border-[oklch(0.78_0.22_155/0.2)] bg-[oklch(0.78_0.22_155/0.05)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Target className="w-3.5 h-3.5 text-[oklch(0.78_0.22_155)]" />
            <span className="text-[10px] font-mono font-bold text-[oklch(0.78_0.22_155)] uppercase tracking-wide">Top Opportunity</span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{briefing.opportunity}</p>
        </div>

        {/* Risk Watch */}
        <div className="p-3 rounded border border-[oklch(0.78_0.18_75/0.2)] bg-[oklch(0.78_0.18_75/0.05)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[oklch(0.78_0.18_75)]" />
            <span className="text-[10px] font-mono font-bold text-[oklch(0.78_0.18_75)] uppercase tracking-wide">Risk Watch</span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{briefing.riskWatch}</p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
          <div className="text-center">
            <div className="text-[9px] font-mono text-muted-foreground mb-0.5">SIGNAL</div>
            <div className={`text-xs font-mono font-bold ${
              briefing.dominantSignal === 'BUY' ? 'text-[oklch(0.78_0.22_155)]' :
              briefing.dominantSignal === 'SELL' ? 'text-[oklch(0.65_0.22_27)]' : 'text-[oklch(0.78_0.18_75)]'
            }`}>{briefing.dominantSignal}</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] font-mono text-muted-foreground mb-0.5">MOMENTUM</div>
            <div className="text-xs font-mono font-bold text-foreground">{briefing.sentimentScore}/100</div>
          </div>
          <div className="text-center">
            <div className="text-[9px] font-mono text-muted-foreground mb-0.5">RISK</div>
            <div className={`text-xs font-mono font-bold ${
              briefing.riskLevel === 'HIGH' ? 'text-[oklch(0.65_0.22_27)]' :
              briefing.riskLevel === 'MEDIUM' ? 'text-[oklch(0.78_0.18_75)]' : 'text-[oklch(0.78_0.22_155)]'
            }`}>{briefing.riskLevel}</div>
          </div>
        </div>

        <p className="text-[9px] text-muted-foreground/50 font-mono text-center">
          Not financial advice · Updates with each analysis
        </p>
      </div>
    </div>
  );
}
