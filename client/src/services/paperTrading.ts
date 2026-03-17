// CryptoAlpha — Paper Trading Service
// Virtual portfolio with open/close trades, P&L tracking, and localStorage persistence

import type { TradeSetup, TradeDirection } from './tradeSetup';

export type TradeStatus = 'OPEN' | 'CLOSED' | 'STOPPED_OUT';

export interface PaperTrade {
  id: string;
  coinId: string;
  ticker: string;
  name: string;
  image: string | null;
  direction: TradeDirection;
  timeframe: string;
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  positionSizePct: number;
  portfolioValueAtEntry: number;
  dollarRisked: number;
  dollarInvested: number;
  status: TradeStatus;
  openedAt: number;
  closedAt: number | null;
  pnlDollar: number | null;
  pnlPct: number | null;
  currentPrice: number;
  notes: string;
}

export interface PaperPortfolio {
  balance: number;         // Current virtual cash balance
  startingBalance: number;
  trades: PaperTrade[];
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  openTrades: number;
}

const STORAGE_KEY = 'cryptoalpha_paper_portfolio';
const DEFAULT_BALANCE = 10000;

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function loadPortfolio(): PaperPortfolio {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PaperPortfolio;
      return parsed;
    }
  } catch {
    // ignore
  }
  return {
    balance: DEFAULT_BALANCE,
    startingBalance: DEFAULT_BALANCE,
    trades: [],
    totalPnl: 0,
    winRate: 0,
    totalTrades: 0,
    openTrades: 0,
  };
}

export function savePortfolio(portfolio: PaperPortfolio): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
  } catch {
    // ignore
  }
}

function recalcStats(portfolio: PaperPortfolio): PaperPortfolio {
  const closed = portfolio.trades.filter(t => t.status !== 'OPEN');
  const open = portfolio.trades.filter(t => t.status === 'OPEN');
  const wins = closed.filter(t => (t.pnlDollar ?? 0) > 0).length;
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnlDollar ?? 0), 0);
  const openUnrealizedPnl = open.reduce((sum, t) => {
    const diff =
      t.direction === 'LONG'
        ? t.currentPrice - t.entryPrice
        : t.entryPrice - t.currentPrice;
    const pnl = (diff / t.entryPrice) * t.dollarInvested;
    return sum + pnl;
  }, 0);

  return {
    ...portfolio,
    totalPnl: totalPnl + openUnrealizedPnl,
    winRate: closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0,
    totalTrades: portfolio.trades.length,
    openTrades: open.length,
  };
}

export function openTrade(
  portfolio: PaperPortfolio,
  setup: TradeSetup,
  coinId: string,
  ticker: string,
  name: string,
  image: string | null,
  currentPrice: number
): { portfolio: PaperPortfolio; trade: PaperTrade } {
  const dollarInvested = (setup.positionSizePct / 100) * portfolio.balance;
  const dollarRisked = dollarInvested * (setup.stopLossPct / 100);

  const trade: PaperTrade = {
    id: generateId(),
    coinId,
    ticker: ticker.toUpperCase(),
    name,
    image,
    direction: setup.direction,
    timeframe: setup.timeframeLabel,
    entryPrice: setup.entryPrice,
    exitPrice: null,
    stopLoss: setup.stopLoss,
    tp1: setup.targets[0].price,
    tp2: setup.targets[1].price,
    tp3: setup.targets[2].price,
    positionSizePct: setup.positionSizePct,
    portfolioValueAtEntry: portfolio.balance,
    dollarRisked,
    dollarInvested,
    status: 'OPEN',
    openedAt: Date.now(),
    closedAt: null,
    pnlDollar: null,
    pnlPct: null,
    currentPrice,
    notes: setup.rationale,
  };

  const updated: PaperPortfolio = {
    ...portfolio,
    trades: [trade, ...portfolio.trades],
  };

  const final = recalcStats(updated);
  savePortfolio(final);
  return { portfolio: final, trade };
}

export function closeTrade(
  portfolio: PaperPortfolio,
  tradeId: string,
  exitPrice: number,
  status: TradeStatus = 'CLOSED'
): PaperPortfolio {
  const trades = portfolio.trades.map(t => {
    if (t.id !== tradeId) return t;
    const diff =
      t.direction === 'LONG' ? exitPrice - t.entryPrice : t.entryPrice - exitPrice;
    const pnlPct = (diff / t.entryPrice) * 100;
    const pnlDollar = (diff / t.entryPrice) * t.dollarInvested;
    return {
      ...t,
      exitPrice,
      status,
      closedAt: Date.now(),
      pnlDollar,
      pnlPct,
      currentPrice: exitPrice,
    };
  });

  const closedTrade = trades.find(t => t.id === tradeId)!;
  const newBalance = portfolio.balance + (closedTrade.pnlDollar ?? 0);

  const updated: PaperPortfolio = {
    ...portfolio,
    balance: Math.max(newBalance, 0),
    trades,
  };

  const final = recalcStats(updated);
  savePortfolio(final);
  return final;
}

export function updateTradePrice(
  portfolio: PaperPortfolio,
  coinId: string,
  currentPrice: number
): PaperPortfolio {
  const trades = portfolio.trades.map(t => {
    if (t.coinId !== coinId || t.status !== 'OPEN') return t;

    // Auto stop-out check
    const hitStop =
      t.direction === 'LONG'
        ? currentPrice <= t.stopLoss
        : currentPrice >= t.stopLoss;

    if (hitStop) {
      const diff =
        t.direction === 'LONG'
          ? t.stopLoss - t.entryPrice
          : t.entryPrice - t.stopLoss;
      const pnlPct = (diff / t.entryPrice) * 100;
      const pnlDollar = (diff / t.entryPrice) * t.dollarInvested;
      return {
        ...t,
        currentPrice,
        exitPrice: t.stopLoss,
        status: 'STOPPED_OUT' as TradeStatus,
        closedAt: Date.now(),
        pnlDollar,
        pnlPct,
      };
    }

    return { ...t, currentPrice };
  });

  const updated = recalcStats({ ...portfolio, trades });
  savePortfolio(updated);
  return updated;
}

export function resetPortfolio(startingBalance: number = DEFAULT_BALANCE): PaperPortfolio {
  const fresh: PaperPortfolio = {
    balance: startingBalance,
    startingBalance,
    trades: [],
    totalPnl: 0,
    winRate: 0,
    totalTrades: 0,
    openTrades: 0,
  };
  savePortfolio(fresh);
  return fresh;
}

// Update starting balance without wiping trades — adjusts balance proportionally
export function setStartingBalance(
  portfolio: PaperPortfolio,
  newStartingBalance: number
): PaperPortfolio {
  // Recalculate balance: keep the same P&L delta, just change the base
  const pnlDelta = portfolio.balance - portfolio.startingBalance;
  const updated: PaperPortfolio = {
    ...portfolio,
    startingBalance: newStartingBalance,
    balance: newStartingBalance + pnlDelta,
  };
  const final = recalcStats(updated);
  savePortfolio(final);
  return final;
}

export function getOpenPnl(trade: PaperTrade): number {
  if (trade.status !== 'OPEN') return trade.pnlDollar ?? 0;
  const diff =
    trade.direction === 'LONG'
      ? trade.currentPrice - trade.entryPrice
      : trade.entryPrice - trade.currentPrice;
  return (diff / trade.entryPrice) * trade.dollarInvested;
}

export function getOpenPnlPct(trade: PaperTrade): number {
  if (trade.status !== 'OPEN') return trade.pnlPct ?? 0;
  const diff =
    trade.direction === 'LONG'
      ? trade.currentPrice - trade.entryPrice
      : trade.entryPrice - trade.currentPrice;
  return (diff / trade.entryPrice) * 100;
}
