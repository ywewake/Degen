// CryptoAlpha — Portfolio Tracker (SIGNALS Plan Feature)
// Multi-coin portfolio tracker with live P&L. Users add coins with entry price
// and quantity. Live prices fetched from CoinGecko. Persisted in localStorage.

import { useState, useEffect, useCallback } from 'react';
import { PieChart, Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { getMarketData } from '@/services/coingecko';

interface PortfolioPosition {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  image: string;
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  lastUpdated: number;
}

const STORAGE_KEY = 'cryptoalpha:portfolio_tracker';

function loadPositions(): PortfolioPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePositions(positions: PortfolioPosition[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(positions)); } catch { /* ignore */ }
}

interface Props {
  currentCoin?: { id: string; symbol: string; name: string; image: string; price: number } | null;
}

export function PortfolioTracker({ currentCoin }: Props) {
  const [positions, setPositions] = useState<PortfolioPosition[]>(loadPositions);
  const [showAdd, setShowAdd] = useState(false);
  const [entryPrice, setEntryPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const totalValue = positions.reduce((sum, p) => sum + p.currentPrice * p.quantity, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.entryPrice * p.quantity, 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const isUp = totalPnl >= 0;

  const refreshPrices = useCallback(async () => {
    if (positions.length === 0) return;
    setRefreshing(true);
    const updated = [...positions];
    for (const pos of updated) {
      try {
        const data = await getMarketData(pos.coinId);
        pos.currentPrice = data.current_price;
        pos.lastUpdated = Date.now();
        await new Promise(r => setTimeout(r, 250));
      } catch { /* keep stale price */ }
    }
    setPositions(updated);
    savePositions(updated);
    setRefreshing(false);
    toast.success('Prices refreshed');
  }, [positions]);

  // Auto-update current coin price in portfolio
  useEffect(() => {
    if (!currentCoin) return;
    setPositions(prev => {
      const updated = prev.map(p =>
        p.coinId === currentCoin.id
          ? { ...p, currentPrice: currentCoin.price, lastUpdated: Date.now() }
          : p
      );
      savePositions(updated);
      return updated;
    });
  }, [currentCoin]);

  const addPosition = useCallback(() => {
    if (!currentCoin) { toast.error('Analyze a coin first to add it'); return; }
    const entry = parseFloat(entryPrice);
    const qty = parseFloat(quantity);
    if (isNaN(entry) || entry <= 0) { toast.error('Enter a valid entry price'); return; }
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid quantity'); return; }

    const pos: PortfolioPosition = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      coinId: currentCoin.id,
      symbol: currentCoin.symbol,
      name: currentCoin.name,
      image: currentCoin.image,
      entryPrice: entry,
      quantity: qty,
      currentPrice: currentCoin.price,
      lastUpdated: Date.now(),
    };

    setPositions(prev => {
      const updated = [pos, ...prev];
      savePositions(updated);
      return updated;
    });
    setEntryPrice('');
    setQuantity('');
    setShowAdd(false);
    toast.success(`${currentCoin.symbol} added to portfolio`);
  }, [currentCoin, entryPrice, quantity]);

  const removePosition = useCallback((id: string) => {
    setPositions(prev => {
      const updated = prev.filter(p => p.id !== id);
      savePositions(updated);
      return updated;
    });
  }, []);

  return (
    <div className="data-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[oklch(0.78_0.18_75)]" />
          <span className="text-sm font-semibold text-foreground">Portfolio Tracker</span>
          <span className="text-[9px] font-mono bg-[oklch(0.78_0.18_75)]/15 text-[oklch(0.78_0.18_75)] border border-[oklch(0.78_0.18_75)]/30 rounded-full px-1.5 py-0.5">
            SIGNALS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshPrices}
            disabled={refreshing || positions.length === 0}
            aria-label="Refresh portfolio prices"
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAdd(v => !v)}
            disabled={!currentCoin}
            aria-label="Add position to portfolio"
            className="flex items-center gap-1 text-[10px] font-mono font-bold text-[oklch(0.78_0.18_75)] hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>

      {/* Portfolio summary */}
      {positions.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-xs font-mono font-bold text-foreground">
                ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Total Value</div>
            </div>
            <div className="text-center">
              <div className={`text-xs font-mono font-bold ${isUp ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                {isUp ? '+' : ''}${totalPnl.toFixed(2)}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Total P&L</div>
            </div>
            <div className="text-center">
              <div className={`text-xs font-mono font-bold ${isUp ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                {isUp ? '+' : ''}{totalPnlPct.toFixed(2)}%
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">Return</div>
            </div>
          </div>
        </div>
      )}

      {/* Add position form */}
      {showAdd && currentCoin && (
        <div className="px-4 py-3 border-b border-border bg-secondary/20">
          <div className="text-[10px] font-mono text-muted-foreground mb-2">
            Adding: <span className="text-foreground font-bold">{currentCoin.symbol}</span> @ ${currentCoin.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="number"
              value={entryPrice}
              onChange={e => setEntryPrice(e.target.value)}
              placeholder="Entry price"
              aria-label="Entry price"
              className="h-8 px-2 bg-secondary border border-border rounded text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="Quantity"
              aria-label="Quantity"
              className="h-8 px-2 bg-secondary border border-border rounded text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          {entryPrice && quantity && (
            <div className="text-[10px] font-mono text-muted-foreground mb-2">
              Cost basis: ${(parseFloat(entryPrice) * parseFloat(quantity)).toFixed(2)}
            </div>
          )}
          <button
            onClick={addPosition}
            className="w-full py-1.5 bg-[oklch(0.78_0.18_75)]/15 border border-[oklch(0.78_0.18_75)]/40 text-[oklch(0.78_0.18_75)] rounded text-[10px] font-mono font-bold hover:opacity-80 transition-opacity"
          >
            Add to Portfolio
          </button>
        </div>
      )}

      {/* Positions list */}
      <div className="px-4 py-3 space-y-2 max-h-72 overflow-y-auto">
        {positions.length === 0 && (
          <div className="text-center py-6">
            <PieChart className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground font-mono">No positions tracked</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Analyze a coin and tap "Add" to track it</p>
          </div>
        )}

        {positions.map(pos => {
          const posValue = pos.currentPrice * pos.quantity;
          const posCost = pos.entryPrice * pos.quantity;
          const posPnl = posValue - posCost;
          const posPnlPct = posCost > 0 ? (posPnl / posCost) * 100 : 0;
          const posUp = posPnl >= 0;

          return (
            <div key={pos.id} className="flex items-center gap-2 p-2 rounded border border-border bg-secondary/20 group">
              <img
                src={pos.image}
                alt={pos.symbol}
                className="w-6 h-6 rounded-full shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-foreground">{pos.symbol}</span>
                  <span className="text-[9px] text-muted-foreground">{pos.quantity} units</span>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground">
                  Entry ${pos.entryPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })} → Now ${pos.currentPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-xs font-mono font-bold ${posUp ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                  {posUp ? '+' : ''}${posPnl.toFixed(2)}
                </div>
                <div className={`text-[9px] font-mono ${posUp ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                  {posUp ? '+' : ''}{posPnlPct.toFixed(2)}%
                </div>
              </div>
              <button
                onClick={() => removePosition(pos.id)}
                aria-label={`Remove ${pos.symbol} from portfolio`}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
