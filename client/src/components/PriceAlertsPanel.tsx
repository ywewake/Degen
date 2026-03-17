// CryptoAlpha — Price Alerts Panel (PRO Feature)
// Lets users set price targets (above/below) for any analyzed coin.
// Alerts are stored in localStorage and checked on each analysis refresh.

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Plus, Trash2, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export interface PriceAlert {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  targetPrice: number;
  direction: 'above' | 'below';
  currentPrice: number;
  createdAt: number;
  triggered: boolean;
  triggeredAt?: number;
}

const STORAGE_KEY = 'cryptoalpha:alerts';

function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAlerts(alerts: PriceAlert[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)); } catch { /* ignore */ }
}

interface Props {
  currentCoin?: { id: string; symbol: string; name: string; price: number } | null;
}

export function PriceAlertsPanel({ currentCoin }: Props) {
  const [alerts, setAlerts] = useState<PriceAlert[]>(loadAlerts);
  const [targetInput, setTargetInput] = useState('');
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [showAdd, setShowAdd] = useState(false);

  // Stable primitive deps — avoids infinite re-render from object reference changes
  const coinId = currentCoin?.id;
  const coinPrice = currentCoin?.price;
  const coinSymbol = currentCoin?.symbol;

  // Check alerts against current price
  useEffect(() => {
    if (!coinId || coinPrice == null) return;
    setAlerts(prev => {
      let changed = false;
      const updated = prev.map(alert => {
        if (alert.triggered || alert.coinId !== coinId) return alert;
        const hit =
          (alert.direction === 'above' && coinPrice >= alert.targetPrice) ||
          (alert.direction === 'below' && coinPrice <= alert.targetPrice);
        if (hit) {
          changed = true;
          toast.success(
            `🔔 Alert triggered! ${alert.symbol} is ${alert.direction} $${alert.targetPrice.toLocaleString()}`,
            { duration: 6000 }
          );
          return { ...alert, triggered: true, triggeredAt: Date.now() };
        }
        return alert;
      });
      if (changed) { saveAlerts(updated); return updated; }
      return prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coinId, coinPrice, coinSymbol]);

  const addAlert = useCallback(() => {
    if (!currentCoin) { toast.error('Analyze a coin first'); return; }
    const target = parseFloat(targetInput);
    if (isNaN(target) || target <= 0) { toast.error('Enter a valid price target'); return; }

    const alert: PriceAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      coinId: currentCoin.id,
      symbol: currentCoin.symbol,
      name: currentCoin.name,
      targetPrice: target,
      direction,
      currentPrice: currentCoin.price,
      createdAt: Date.now(),
      triggered: false,
    };

    setAlerts(prev => {
      const updated = [alert, ...prev];
      saveAlerts(updated);
      return updated;
    });
    setTargetInput('');
    setShowAdd(false);
    toast.success(`Alert set: ${currentCoin.symbol} ${direction} $${target.toLocaleString()}`);
  }, [currentCoin, targetInput, direction]);

  const removeAlert = useCallback((id: string) => {
    setAlerts(prev => {
      const updated = prev.filter(a => a.id !== id);
      saveAlerts(updated);
      return updated;
    });
  }, []);

  const clearTriggered = useCallback(() => {
    setAlerts(prev => {
      const updated = prev.filter(a => !a.triggered);
      saveAlerts(updated);
      return updated;
    });
    toast.success('Cleared triggered alerts');
  }, []);

  const activeAlerts = alerts.filter(a => !a.triggered);
  const triggeredAlerts = alerts.filter(a => a.triggered);

  return (
    <div className="data-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-[oklch(0.78_0.22_155)]" />
          <span className="text-sm font-semibold text-foreground">Price Alerts</span>
          {activeAlerts.length > 0 && (
            <span className="text-[9px] font-mono bg-[oklch(0.78_0.22_155)]/15 text-[oklch(0.78_0.22_155)] border border-[oklch(0.78_0.22_155)]/30 rounded-full px-1.5 py-0.5">
              {activeAlerts.length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {triggeredAlerts.length > 0 && (
            <button
              onClick={clearTriggered}
              aria-label="Clear triggered alerts"
              className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear triggered
            </button>
          )}
          <button
            onClick={() => setShowAdd(v => !v)}
            aria-label="Add price alert"
            disabled={!currentCoin}
            className="flex items-center gap-1 text-[10px] font-mono font-bold text-[oklch(0.78_0.22_155)] hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Alert
          </button>
        </div>
      </div>

      {/* Add alert form */}
      {showAdd && currentCoin && (
        <div className="px-4 py-3 border-b border-border bg-secondary/20">
          <div className="text-[10px] font-mono text-muted-foreground mb-2">
            Current: <span className="text-foreground font-bold">{currentCoin.symbol}</span> @ ${currentCoin.price.toLocaleString('en-US', { maximumFractionDigits: 4 })}
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setDirection('above')}
              aria-pressed={direction === 'above'}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-[10px] font-mono font-bold transition-all ${
                direction === 'above'
                  ? 'border-[oklch(0.75_0.22_145)] text-[oklch(0.75_0.22_145)] bg-[oklch(0.75_0.22_145)]/10'
                  : 'border-border text-muted-foreground hover:bg-secondary/40'
              }`}
            >
              <TrendingUp className="w-3 h-3" />
              Above
            </button>
            <button
              onClick={() => setDirection('below')}
              aria-pressed={direction === 'below'}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-[10px] font-mono font-bold transition-all ${
                direction === 'below'
                  ? 'border-[oklch(0.65_0.22_27)] text-[oklch(0.65_0.22_27)] bg-[oklch(0.65_0.22_27)]/10'
                  : 'border-border text-muted-foreground hover:bg-secondary/40'
              }`}
            >
              <TrendingDown className="w-3 h-3" />
              Below
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={targetInput}
              onChange={e => setTargetInput(e.target.value)}
              placeholder={`Target price (e.g. ${(currentCoin.price * 1.1).toFixed(2)})`}
              aria-label="Alert target price"
              className="flex-1 h-8 px-2 bg-secondary border border-border rounded text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              onKeyDown={e => e.key === 'Enter' && addAlert()}
            />
            <button
              onClick={addAlert}
              className="h-8 px-3 bg-[oklch(0.78_0.22_155)]/15 border border-[oklch(0.78_0.22_155)]/40 text-[oklch(0.78_0.22_155)] rounded text-[10px] font-mono font-bold hover:opacity-80 transition-opacity"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Alert list */}
      <div className="px-4 py-3 space-y-2 max-h-64 overflow-y-auto">
        {alerts.length === 0 && (
          <div className="text-center py-6">
            <BellOff className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground font-mono">No alerts set</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Analyze a coin and tap "Add Alert"</p>
          </div>
        )}

        {alerts.map(alert => (
          <div
            key={alert.id}
            className={`flex items-center gap-2 p-2 rounded border text-xs ${
              alert.triggered
                ? 'border-[oklch(0.75_0.22_145)]/30 bg-[oklch(0.75_0.22_145)]/5'
                : 'border-border bg-secondary/20'
            }`}
          >
            {alert.triggered ? (
              <CheckCircle className="w-3.5 h-3.5 text-[oklch(0.75_0.22_145)] shrink-0" />
            ) : alert.direction === 'above' ? (
              <TrendingUp className="w-3.5 h-3.5 text-[oklch(0.75_0.22_145)] shrink-0" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-[oklch(0.65_0.22_27)] shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="font-mono font-bold text-foreground">{alert.symbol}</span>
              <span className="text-muted-foreground ml-1.5">
                {alert.direction} ${alert.targetPrice.toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </span>
              {alert.triggered && (
                <span className="ml-1.5 text-[oklch(0.75_0.22_145)] text-[9px] font-mono">✓ TRIGGERED</span>
              )}
            </div>
            <button
              onClick={() => removeAlert(alert.id)}
              aria-label={`Remove alert for ${alert.symbol}`}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
