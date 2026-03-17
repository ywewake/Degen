// CryptoAlpha — Main Analyzer Hook
// Review fixes applied:
//   - Section 1 Issue 1: Race condition fix via requestId/abortRef
//   - Section 5 Optimization 2: Memoized analysis result (useMemo)
//   - Section 6: logger integration
//   - Preserved all existing exported types and function signatures

import { useState, useCallback, useRef, useMemo } from 'react';
import { searchCoins, getMarketData, resolveTickerToId, type SearchResult } from '@/services/coingecko';
import { analyzeMarketData, type AnalysisResult } from '@/services/analysis';
import { logger } from '@/utils/logger';

export type AnalyzerState = 'idle' | 'loading' | 'success' | 'error';

export interface UseAnalyzerReturn {
  state: AnalyzerState;
  result: AnalysisResult | null;
  error: string | null;
  searchResults: SearchResult[];
  isSearching: boolean;
  analyze: (query: string) => Promise<void>;
  search: (query: string) => Promise<void>;
  reset: () => void;
}

export function useAnalyzer(): UseAnalyzerReturn {
  const [state, setState] = useState<AnalyzerState>('idle');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Race condition fix (Section 1 Issue 1):
  // Each analyze() call increments this counter. The callback only commits
  // its result if the counter hasn't changed since it started.
  const requestIdRef = useRef(0);

  const analyze = useCallback(async (query: string) => {
    if (!query.trim()) return;

    // Increment request ID — any in-flight request with an older ID is stale
    const currentRequestId = ++requestIdRef.current;

    setState('loading');
    setError(null);
    setResult(null);
    setSearchResults([]);

    logger.info('analyze start', { query, requestId: currentRequestId });

    try {
      // If the query looks like a CoinGecko ID (contains hyphens or is all lowercase),
      // skip resolution and fetch directly. This handles watchlist tap-to-analyze.
      const isDirectId = /^[a-z0-9]+(-[a-z0-9]+)+$/.test(query.trim());
      const coinId = isDirectId ? query.trim() : await resolveTickerToId(query.trim());

      // Stale check: if a newer request started, discard this result
      if (currentRequestId !== requestIdRef.current) {
        logger.debug('analyze stale, discarding', { requestId: currentRequestId });
        return;
      }

      const marketData = await getMarketData(coinId);

      // Stale check again after second async call
      if (currentRequestId !== requestIdRef.current) {
        logger.debug('analyze stale after market fetch, discarding', { requestId: currentRequestId });
        return;
      }

      const analysis = analyzeMarketData(marketData);
      logger.info('analyze success', { coin: analysis.name, requestId: currentRequestId });
      setResult(analysis);
      setState('success');
    } catch (err) {
      // Only commit error if this is still the current request
      if (currentRequestId !== requestIdRef.current) return;
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      logger.error('analyze failed', err);
      setError(msg);
      setState('error');
    }
  }, []);

  const search = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchCoins(query);
      setSearchResults(results.slice(0, 8));
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const reset = useCallback(() => {
    // Cancel any in-flight request by advancing the request ID
    requestIdRef.current++;
    setState('idle');
    setResult(null);
    setError(null);
    setSearchResults([]);
  }, []);

  // Memoize the return object to prevent unnecessary re-renders in consumers
  // (Section 5 Optimization 2)
  const returnValue = useMemo(
    () => ({ state, result, error, searchResults, isSearching, analyze, search, reset }),
    [state, result, error, searchResults, isSearching, analyze, search, reset]
  );

  return returnValue;
}
