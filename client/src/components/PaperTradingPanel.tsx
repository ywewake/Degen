// CryptoAlpha — Paper Trading Panel
// Design: Terminal-Brutalism dark theme
// Shows portfolio balance, open trades, closed history, P&L
// Balance is fully adjustable via slider + direct input

import { useState, useRef } from 'react';
import { TrendingUp, TrendingDown, RotateCcw, FlaskConical, ChevronDown, ChevronUp, Settings2, Check } from 'lucide-react';
import type { PaperPortfolio, PaperTrade } from '@/services/paperTrading';
import { getOpenPnl, getOpenPnlPct } from '@/services/paperTrading';
import { formatPrice, formatPercent } from '@/lib/format';

interface Props {
  portfolio: PaperPortfolio;
  currentPrice?: number;
  onClose: (tradeId: string, exitPrice: number) => void;
  onReset: (startingBalance?: number) => void;
  onAdjustBalance: (newBalance: number) => void;
}

// Preset amounts for quick selection
const BALANCE_PRESETS = [500, 1000, 5000, 10000, 25000, 50000, 100000];

function formatBalanceShort(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function PnlBadge({ value, pct }: { value: number; pct: number }) {
  const pos = value >= 0;
  return (
    <div className={`flex flex-col items-end ${pos ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
      <span className="text-xs font-bold font-mono">
        {pos ? '+' : '-'}${Math.abs(value).toFixed(2)}
      </span>
      <span className="text-[10px] font-mono opacity-80">
        {formatPercent(pct, 2)}
      </span>
    </div>
  );
}

function TradeRow({
  trade,
  currentPrice,
  onClose,
}: {
  trade: PaperTrade;
  currentPrice?: number;
  onClose?: (id: string, price: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOpen = trade.status === 'OPEN';
  const isLong = trade.direction === 'LONG';
  const pnl = isOpen ? getOpenPnl(trade) : (trade.pnlDollar ?? 0);
  const pnlPct = isOpen ? getOpenPnlPct(trade) : (trade.pnlPct ?? 0);
  const pos = pnl >= 0;

  const statusBadge =
    trade.status === 'OPEN'
      ? 'bg-primary/15 text-primary border-primary/30'
      : trade.status === 'STOPPED_OUT'
      ? 'bg-[oklch(0.65_0.22_27)]/15 text-[oklch(0.65_0.22_27)] border-[oklch(0.65_0.22_27)]/30'
      : pos
      ? 'bg-[oklch(0.75_0.22_145)]/15 text-[oklch(0.75_0.22_145)] border-[oklch(0.75_0.22_145)]/30'
      : 'bg-[oklch(0.65_0.22_27)]/15 text-[oklch(0.65_0.22_27)] border-[oklch(0.65_0.22_27)]/30';

  const statusLabel =
    trade.status === 'OPEN' ? 'OPEN' : trade.status === 'STOPPED_OUT' ? 'STOPPED' : 'CLOSED';

  return (
    <div className="border border-border rounded overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-secondary/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
          isLong ? 'bg-[oklch(0.75_0.22_145)]/15' : 'bg-[oklch(0.65_0.22_27)]/15'
        }`}>
          {isLong
            ? <TrendingUp className="w-3.5 h-3.5 text-[oklch(0.75_0.22_145)]" />
            : <TrendingDown className="w-3.5 h-3.5 text-[oklch(0.65_0.22_27)]" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold font-mono text-foreground">{trade.ticker}</span>
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${statusBadge}`}>
              {statusLabel}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">
            {trade.timeframe} · Entry {formatPrice(trade.entryPrice)}
          </div>
        </div>
        <PnlBadge value={pnl} pct={pnlPct} />
        <div className="text-muted-foreground ml-1">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3 bg-secondary/20">
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div>
              <div className="text-muted-foreground text-[10px] uppercase mb-0.5">Entry</div>
              <div className="text-foreground font-bold">{formatPrice(trade.entryPrice)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase mb-0.5">Stop Loss</div>
              <div className="text-[oklch(0.65_0.22_27)] font-bold">{formatPrice(trade.stopLoss)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase mb-0.5">TP1</div>
              <div className="text-[oklch(0.75_0.22_145)] font-bold">{formatPrice(trade.tp1)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase mb-0.5">TP2</div>
              <div className="text-[oklch(0.75_0.22_145)] font-bold">{formatPrice(trade.tp2)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase mb-0.5">TP3</div>
              <div className="text-[oklch(0.75_0.22_145)] font-bold">{formatPrice(trade.tp3)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px] uppercase mb-0.5">
                {isOpen ? 'Current' : 'Exit'}
              </div>
              <div className={`font-bold ${pos ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
                {formatPrice(isOpen ? trade.currentPrice : (trade.exitPrice ?? trade.currentPrice))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 text-[10px] font-mono text-muted-foreground flex-wrap">
            <span>Invested: <span className="text-foreground">${trade.dollarInvested.toFixed(2)}</span></span>
            <span>Risked: <span className="text-[oklch(0.65_0.22_27)]">${trade.dollarRisked.toFixed(2)}</span></span>
            <span>Size: <span className="text-foreground">{trade.positionSizePct.toFixed(1)}%</span></span>
          </div>

          <div className="text-[10px] font-mono text-muted-foreground">
            Opened: {new Date(trade.openedAt).toLocaleString()}
            {trade.closedAt && ` · Closed: ${new Date(trade.closedAt).toLocaleString()}`}
          </div>

          {isOpen && onClose && (
            <div className="flex gap-2">
              <button
                onClick={() => onClose(trade.id, currentPrice ?? trade.currentPrice)}
                className="flex-1 py-2 rounded border border-[oklch(0.75_0.22_145)]/40 bg-[oklch(0.75_0.22_145)]/10 text-[oklch(0.75_0.22_145)] text-xs font-bold font-mono hover:bg-[oklch(0.75_0.22_145)]/20 transition-colors"
              >
                Close at Market ({formatPrice(currentPrice ?? trade.currentPrice)})
              </button>
              <button
                onClick={() => onClose(trade.id, trade.stopLoss)}
                className="py-2 px-3 rounded border border-[oklch(0.65_0.22_27)]/40 bg-[oklch(0.65_0.22_27)]/10 text-[oklch(0.65_0.22_27)] text-xs font-bold font-mono hover:bg-[oklch(0.65_0.22_27)]/20 transition-colors"
              >
                Stop Out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PaperTradingPanel({ portfolio, currentPrice, onClose, onReset, onAdjustBalance }: Props) {
  const [tab, setTab] = useState<'open' | 'history' | 'settings'>('open');
  const [customInput, setCustomInput] = useState('');
  const [sliderValue, setSliderValue] = useState(portfolio.startingBalance);
  const [confirmReset, setConfirmReset] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openTrades = portfolio.trades.filter(t => t.status === 'OPEN');
  const closedTrades = portfolio.trades.filter(t => t.status !== 'OPEN');
  const totalReturn = portfolio.balance - portfolio.startingBalance;
  const totalReturnPct = (totalReturn / portfolio.startingBalance) * 100;
  const isProfit = totalReturn >= 0;

  // Slider: log scale from $100 to $1,000,000
  const LOG_MIN = Math.log10(100);
  const LOG_MAX = Math.log10(1000000);
  const balanceToSlider = (b: number) =>
    Math.round(((Math.log10(Math.max(b, 100)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100);
  const sliderToBalance = (s: number) =>
    Math.round(Math.pow(10, LOG_MIN + (s / 100) * (LOG_MAX - LOG_MIN)));

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const s = Number(e.target.value);
    setSliderValue(sliderToBalance(s));
  };

  const handleSliderCommit = () => {
    onAdjustBalance(sliderValue);
  };

  const handlePreset = (amount: number) => {
    setSliderValue(amount);
    onAdjustBalance(amount);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(customInput.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val >= 100 && val <= 10000000) {
      setSliderValue(val);
      onAdjustBalance(val);
      setCustomInput('');
    }
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    onReset(sliderValue);
    setConfirmReset(false);
  };

  return (
    <div className="data-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-[oklch(0.78_0.18_75)]" />
          <span className="text-xs font-bold text-foreground tracking-widest uppercase">
            Paper Trading
          </span>
          <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
            VIRTUAL
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab(tab === 'settings' ? 'open' : 'settings')}
            className={`p-1.5 rounded transition-colors ${tab === 'settings' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
            title="Portfolio settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleReset}
            className={`p-1.5 rounded transition-colors ${confirmReset ? 'text-[oklch(0.65_0.22_27)] bg-[oklch(0.65_0.22_27)]/10' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
            title={confirmReset ? 'Click again to confirm reset' : 'Reset portfolio'}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Portfolio stats */}
      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] text-muted-foreground font-mono uppercase mb-0.5">Balance</div>
            <div className="text-sm font-bold font-mono text-foreground">
              ${portfolio.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              of ${portfolio.startingBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-mono uppercase mb-0.5">Total P&L</div>
            <div className={`text-sm font-bold font-mono ${isProfit ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
              {isProfit ? '+' : '-'}${Math.abs(totalReturn).toFixed(2)}
            </div>
            <div className={`text-[10px] font-mono ${isProfit ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'} opacity-80`}>
              {formatPercent(totalReturnPct, 1)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-mono uppercase mb-0.5">Win Rate</div>
            <div className={`text-sm font-bold font-mono ${portfolio.winRate >= 50 ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
              {portfolio.winRate}%
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              {closedTrades.length} closed
            </div>
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {tab === 'settings' && (
        <div className="px-4 py-4 border-b border-border space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-foreground font-mono uppercase tracking-wider">
                Starting Balance
              </span>
              <span className="text-sm font-bold font-mono text-primary">
                ${sliderValue.toLocaleString('en-US')}
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={0}
              max={100}
              value={balanceToSlider(sliderValue)}
              onChange={handleSliderChange}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary bg-secondary"
            />

            {/* Preset chips */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {BALANCE_PRESETS.map(p => (
                <button
                  key={p}
                  onClick={() => handlePreset(p)}
                  className={`text-[10px] font-mono font-bold px-2 py-1 rounded border transition-colors ${
                    portfolio.startingBalance === p
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                  }`}
                >
                  {formatBalanceShort(p)}
                </button>
              ))}
            </div>

            {/* Custom input */}
            <form onSubmit={handleCustomSubmit} className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">$</span>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="numeric"
                  value={customInput}
                  onChange={e => setCustomInput(e.target.value)}
                  placeholder="Custom amount"
                  className="w-full h-8 pl-6 pr-3 bg-secondary border border-border rounded text-foreground text-xs font-mono focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <button
                type="submit"
                className="h-8 px-3 rounded border border-primary bg-primary/15 text-primary text-xs font-mono font-bold hover:bg-primary/25 transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Set
              </button>
            </form>

            <p className="text-[10px] text-muted-foreground/60 font-mono mt-2">
              Adjusting balance preserves your trade history and P&L delta. Reset to start fresh.
            </p>
          </div>

          {/* Reset with current balance */}
          <button
            onClick={handleReset}
            className={`w-full py-2.5 rounded border text-xs font-mono font-bold transition-colors ${
              confirmReset
                ? 'border-[oklch(0.65_0.22_27)] bg-[oklch(0.65_0.22_27)]/15 text-[oklch(0.65_0.22_27)]'
                : 'border-border text-muted-foreground hover:border-[oklch(0.65_0.22_27)] hover:text-[oklch(0.65_0.22_27)]'
            }`}
          >
            {confirmReset ? '⚠ Confirm Reset — All Trades Wiped' : `Reset Portfolio to $${sliderValue.toLocaleString()}`}
          </button>
        </div>
      )}

      {/* Tabs */}
      {tab !== 'settings' && (
        <>
          <div className="flex border-b border-border">
            <button
              onClick={() => setTab('open')}
              className={`flex-1 py-2.5 text-xs font-mono font-bold transition-colors ${
                tab === 'open'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Open ({openTrades.length})
            </button>
            <button
              onClick={() => setTab('history')}
              className={`flex-1 py-2.5 text-xs font-mono font-bold transition-colors ${
                tab === 'history'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              History ({closedTrades.length})
            </button>
          </div>

          <div className="px-3 py-3 space-y-2 max-h-80 overflow-y-auto">
            {tab === 'open' && (
              <>
                {openTrades.length === 0 ? (
                  <div className="text-center py-8">
                    <FlaskConical className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground font-mono">No open trades</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      Use the Trade Setup tab to enter a paper trade
                    </p>
                  </div>
                ) : (
                  openTrades.map(trade => (
                    <TradeRow
                      key={trade.id}
                      trade={trade}
                      currentPrice={currentPrice}
                      onClose={onClose}
                    />
                  ))
                )}
              </>
            )}
            {tab === 'history' && (
              <>
                {closedTrades.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-muted-foreground font-mono">No closed trades yet</p>
                  </div>
                ) : (
                  closedTrades.map(trade => (
                    <TradeRow key={trade.id} trade={trade} />
                  ))
                )}
              </>
            )}
          </div>
        </>
      )}

      <div className="px-4 pb-3">
        <p className="text-[10px] text-muted-foreground/60 font-mono text-center">
          Paper trading only — no real funds at risk
        </p>
      </div>
    </div>
  );
}
