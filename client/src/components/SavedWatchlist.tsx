// CryptoAlpha — Saved Watchlist (PRO Feature)
// Personal watchlist of saved coins with last-known price.
// Tap any coin to re-analyze. Persisted in localStorage.

import { useState, useCallback } from 'react';
import { Bookmark, BookmarkCheck, Trash2, Zap, Star } from 'lucide-react';
import { toast } from 'sonner';

export interface WatchlistEntry {
  coinId: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  priceChange24h: number;
  savedAt: number;
}

const STORAGE_KEY = 'cryptoalpha:watchlist';

export function loadWatchlist(): WatchlistEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWatchlist(entries: WatchlistEntry[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}

export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>(loadWatchlist);

  const add = useCallback((entry: WatchlistEntry) => {
    setEntries(prev => {
      if (prev.some(e => e.coinId === entry.coinId)) return prev;
      const updated = [entry, ...prev];
      saveWatchlist(updated);
      return updated;
    });
    toast.success(`${entry.symbol} added to watchlist`);
  }, []);

  const remove = useCallback((coinId: string) => {
    setEntries(prev => {
      const updated = prev.filter(e => e.coinId !== coinId);
      saveWatchlist(updated);
      return updated;
    });
  }, []);

  const isSaved = useCallback((coinId: string) => entries.some(e => e.coinId === coinId), [entries]);

  return { entries, add, remove, isSaved };
}

interface Props {
  onAnalyze: (coinId: string) => void;
  watchlist: ReturnType<typeof useWatchlist>;
}

export function SavedWatchlist({ onAnalyze, watchlist }: Props) {
  const { entries, remove } = watchlist;

  return (
    <div className="data-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-[oklch(0.78_0.22_155)]" />
          <span className="text-sm font-semibold text-foreground">My Watchlist</span>
          {entries.length > 0 && (
            <span className="text-[9px] font-mono bg-[oklch(0.78_0.22_155)]/15 text-[oklch(0.78_0.22_155)] border border-[oklch(0.78_0.22_155)]/30 rounded-full px-1.5 py-0.5">
              {entries.length}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">PRO</span>
      </div>

      <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
        {entries.length === 0 && (
          <div className="text-center py-6">
            <Bookmark className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground font-mono">No saved coins</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">
              Analyze a coin and tap the bookmark icon to save it
            </p>
          </div>
        )}

        {entries.map(entry => {
          const isUp = entry.priceChange24h >= 0;
          return (
            <div key={entry.coinId} className="flex items-center gap-2 p-2 rounded border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors group">
              <img
                src={entry.image}
                alt={entry.symbol}
                className="w-6 h-6 rounded-full shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-foreground">{entry.symbol}</span>
                  <span className="text-[10px] text-muted-foreground truncate">{entry.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-foreground">
                    ${entry.price < 0.01 ? entry.price.toFixed(6) : entry.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </span>
                  <span className={`text-[9px] font-mono font-bold ${isUp ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                    {isUp ? '+' : ''}{entry.priceChange24h.toFixed(2)}%
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onAnalyze(entry.coinId)}
                  aria-label={`Analyze ${entry.symbol}`}
                  className="p-1 text-primary hover:opacity-80 transition-opacity"
                >
                  <Zap className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => remove(entry.coinId)}
                  aria-label={`Remove ${entry.symbol} from watchlist`}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bookmark toggle button — shown on the TokenomicsCard header */
export function BookmarkButton({
  coinId, symbol, name, image, price, priceChange24h,
  watchlist,
}: {
  coinId: string; symbol: string; name: string; image: string;
  price: number; priceChange24h: number;
  watchlist: ReturnType<typeof useWatchlist>;
}) {
  const { isSaved, add, remove } = watchlist;
  const saved = isSaved(coinId);

  const toggle = () => {
    if (saved) {
      remove(coinId);
      toast.success(`${symbol} removed from watchlist`);
    } else {
      add({ coinId, symbol, name, image, price, priceChange24h, savedAt: Date.now() });
    }
  };

  return (
    <button
      onClick={toggle}
      aria-label={saved ? `Remove ${symbol} from watchlist` : `Save ${symbol} to watchlist`}
      aria-pressed={saved}
      className={`p-1.5 rounded transition-all hover:opacity-80 active:scale-95 ${
        saved
          ? 'text-[oklch(0.78_0.22_155)]'
          : 'text-muted-foreground hover:text-[oklch(0.78_0.22_155)]'
      }`}
    >
      {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
    </button>
  );
}
