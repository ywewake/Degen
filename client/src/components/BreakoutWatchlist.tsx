// CryptoAlpha — Low-Cap Breakout Watchlist
// Design: Terminal-Brutalism dark theme
// Shows top LONG and SHORT setups from low-cap coins ($5M–$500M market cap)

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Zap, AlertTriangle } from 'lucide-react';
import { fetchBreakoutWatchlist, formatMcap, type BreakoutCandidate, type WatchlistData } from '@/services/watchlist';

interface Props {
  onAnalyze: (ticker: string) => void;
}

function ScoreBar({ score, direction }: { score: number; direction: 'LONG' | 'SHORT' }) {
  const color = direction === 'LONG' ? 'bg-[oklch(0.75_0.22_145)]' : 'bg-[oklch(0.65_0.22_27)]';
  const label =
    score >= 70 ? 'STRONG' : score >= 50 ? 'MODERATE' : 'WEAK';
  const labelColor =
    score >= 70
      ? direction === 'LONG' ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'
      : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-[9px] font-mono font-bold w-14 text-right ${labelColor}`}>
        {label} {score}
      </span>
    </div>
  );
}

function CandidateRow({
  coin,
  rank,
  onAnalyze,
}: {
  coin: BreakoutCandidate;
  rank: number;
  onAnalyze: (ticker: string) => void;
}) {
  const isLong = coin.direction === 'LONG';
  const change = coin.priceChange24h;
  const changeColor = change >= 0 ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]';
  const borderAccent = isLong
    ? 'border-l-[oklch(0.75_0.22_145)]'
    : 'border-l-[oklch(0.65_0.22_27)]';

  return (
    <button
      onClick={() => onAnalyze(coin.id)}
      aria-label={`Analyze ${coin.name} (${coin.symbol})`}
      className={`w-full text-left border border-border border-l-2 ${borderAccent} rounded overflow-hidden hover:bg-secondary/40 active:scale-[0.99] transition-all group`}
    >
      <div className="px-3 py-2.5">
        {/* Top row: rank, coin info, price change */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-mono text-muted-foreground/60 w-4 shrink-0">
            {rank}
          </span>
          <img
            src={coin.image}
            alt={coin.symbol}
            className="w-5 h-5 rounded-full shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold font-mono text-foreground">{coin.symbol}</span>
              <span className="text-[10px] text-muted-foreground truncate">{coin.name}</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              MCap {formatMcap(coin.marketCap)} · #{coin.rank}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xs font-bold font-mono text-foreground">
              ${coin.price < 0.01
                ? coin.price.toFixed(6)
                : coin.price < 1
                ? coin.price.toFixed(4)
                : coin.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
            <div className={`text-[10px] font-mono font-bold ${changeColor}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Score bar */}
        <ScoreBar score={coin.score} direction={coin.direction} />

        {/* Signal chips */}
        <div className="flex flex-wrap gap-1 mt-2">
          {coin.signals.slice(0, 3).map((sig, i) => (
            <span
              key={i}
              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                isLong
                  ? 'border-[oklch(0.75_0.22_145)]/25 text-[oklch(0.75_0.22_145)]/80 bg-[oklch(0.75_0.22_145)]/5'
                  : 'border-[oklch(0.65_0.22_27)]/25 text-[oklch(0.65_0.22_27)]/80 bg-[oklch(0.65_0.22_27)]/5'
              }`}
            >
              {sig}
            </span>
          ))}
          {coin.riskLevel === 'HIGH' && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[oklch(0.78_0.18_75)]/30 text-[oklch(0.78_0.18_75)]/80 bg-[oklch(0.78_0.18_75)]/5">
              HIGH RISK
            </span>
          )}
        </div>

        {/* Tap hint */}
        <div className="flex items-center justify-end gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Zap className="w-2.5 h-2.5 text-primary" />
          <span className="text-[9px] font-mono text-primary">Tap to analyze</span>
        </div>
      </div>
    </button>
  );
}

export function BreakoutWatchlist({ onAnalyze }: Props) {
  const [data, setData] = useState<WatchlistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'long' | 'short'>('long');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBreakoutWatchlist(force);
      setData(result);
    } catch (e) {
      setError('Failed to load watchlist. CoinGecko rate limit may apply — try again in 30s.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const coins = tab === 'long' ? (data?.longs ?? []) : (data?.shorts ?? []);
  const fetchedAgo = data
    ? Math.round((Date.now() - data.fetchedAt) / 60000)
    : null;

  return (
    <div className="data-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-[oklch(0.78_0.18_75)]" />
          <div>
            <span className="text-xs font-bold text-foreground tracking-widest uppercase">
              Breakout Watchlist
            </span>
            <div className="text-[10px] text-muted-foreground font-mono">
              Low-cap $5M–$500M · Tap to analyze
            </div>
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          aria-label="Refresh watchlist"
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab('long')}
          aria-label="Show LONG setups"
          aria-pressed={tab === 'long'}
          className={`flex-1 py-2.5 text-xs font-mono font-bold transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'long'
              ? 'text-[oklch(0.75_0.22_145)] border-b-2 border-[oklch(0.75_0.22_145)]'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          LONG ({data?.longs.length ?? '—'})
        </button>
        <button
          onClick={() => setTab('short')}
          aria-label="Show SHORT setups"
          aria-pressed={tab === 'short'}
          className={`flex-1 py-2.5 text-xs font-mono font-bold transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'short'
              ? 'text-[oklch(0.65_0.22_27)] border-b-2 border-[oklch(0.65_0.22_27)]'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          SHORT ({data?.shorts.length ?? '—'})
        </button>
      </div>

      {/* Content */}
      <div className="px-3 py-3 space-y-2 max-h-[600px] overflow-y-auto">
        {loading && (
          <div className="text-center py-10">
            <RefreshCw className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
            <p className="text-xs text-muted-foreground font-mono">Scanning low-cap markets...</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Fetching 200 coins from CoinGecko</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-8">
            <AlertTriangle className="w-6 h-6 text-[oklch(0.78_0.18_75)]/60 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground font-mono">{error}</p>
            <button
            onClick={() => load(true)}
            className="mt-3 text-xs font-mono text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && coins.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground font-mono">
              No strong {tab.toUpperCase()} setups found right now.
            </p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Market conditions may be neutral — try refreshing later.
            </p>
          </div>
        )}

        {!loading && coins.map((coin, i) => (
          <CandidateRow
            key={coin.id}
            coin={coin}
            rank={i + 1}
            onAnalyze={onAnalyze}
          />
        ))}
      </div>

      {/* Footer */}
      {data && !loading && (
        <div className="px-4 pb-3 border-t border-border pt-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground/60 font-mono">
              Updated {fetchedAgo === 0 ? 'just now' : `${fetchedAgo}m ago`} · CoinGecko data
            </p>
            <p className="text-[10px] text-[oklch(0.78_0.18_75)]/70 font-mono">
              ⚠ Not financial advice
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
