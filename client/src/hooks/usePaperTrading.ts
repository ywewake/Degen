// CryptoAlpha — Paper Trading Hook
// Uses functional setState pattern throughout to avoid stale closure infinite loops.
// All callbacks are stable (empty dep arrays) because they use the prev-state pattern.

import { useState, useCallback } from 'react';
import {
  loadPortfolio,
  openTrade,
  closeTrade,
  updateTradePrice,
  resetPortfolio,
  setStartingBalance,
  type PaperPortfolio,
  type TradeStatus,
} from '@/services/paperTrading';
import type { TradeSetup } from '@/services/tradeSetup';

export function usePaperTrading() {
  const [portfolio, setPortfolio] = useState<PaperPortfolio>(() => loadPortfolio());

  // Stable: uses functional update — no portfolio in dep array
  const enterTrade = useCallback(
    (
      setup: TradeSetup,
      coinId: string,
      ticker: string,
      name: string,
      image: string | null,
      currentPrice: number
    ) => {
      let result: PaperPortfolio | null = null;
      setPortfolio(prev => {
        const { portfolio: updated } = openTrade(prev, setup, coinId, ticker, name, image, currentPrice);
        result = updated;
        return updated;
      });
      return result;
    },
    [] // stable — no deps
  );

  // Stable: uses functional update — no portfolio in dep array
  const exitTrade = useCallback(
    (tradeId: string, exitPrice: number, status: TradeStatus = 'CLOSED') => {
      setPortfolio(prev => closeTrade(prev, tradeId, exitPrice, status));
    },
    [] // stable — no deps
  );

  // Stable: uses functional update — no portfolio in dep array
  // This breaks the infinite loop in Home.tsx where result → refreshPrices → portfolio → refreshPrices
  const refreshPrices = useCallback(
    (coinId: string, currentPrice: number) => {
      setPortfolio(prev => updateTradePrice(prev, coinId, currentPrice));
    },
    [] // stable — no deps
  );

  const reset = useCallback((startingBalance?: number) => {
    setPortfolio(resetPortfolio(startingBalance));
  }, []);

  // Stable: uses functional update — no portfolio in dep array
  const adjustBalance = useCallback(
    (newStartingBalance: number) => {
      setPortfolio(prev => setStartingBalance(prev, newStartingBalance));
    },
    [] // stable — no deps
  );

  const openTrades = portfolio.trades.filter(t => t.status === 'OPEN');
  const closedTrades = portfolio.trades.filter(t => t.status !== 'OPEN');

  return {
    portfolio,
    openTrades,
    closedTrades,
    enterTrade,
    exitTrade,
    refreshPrices,
    reset,
    adjustBalance,
  };
}
