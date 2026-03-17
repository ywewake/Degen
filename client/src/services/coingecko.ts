// CryptoAlpha — CoinGecko Service
// Review fixes applied:
//   - Issue 3: Uses CacheService singleton instead of module-level Map
//   - Issue 10 / Section 3: sanitizeTicker applied before API calls
//   - Optimization 4: TICKER_ID_MAP for instant resolution of top-50 tickers
//   - Section 6: logger for structured logging
//   - Proxy-first strategy for better rate limit resilience

import { cache } from './cache';
import { CACHE_TTL, TICKER_ID_MAP } from '@/utils/constants';
import { sanitizeTicker, isCoinGeckoId } from '@/utils/validation';
import { logger } from '@/utils/logger';

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoinMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number | null;
  fully_diluted_valuation: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_7d_in_currency: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  ath: number | null;
  ath_change_percentage: number | null;
  ath_date: string | null;
  image: string | null;
  market_cap_rank: number | null;
  high_24h: number | null;
  low_24h: number | null;
}

export interface SearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb?: string;
  market_cap_rank?: number;
}

// ─── Fetch with CORS proxy fallback ──────────────────────────────────────────

async function fetchWithFallback(url: string): Promise<Response> {
  // Proxy-first: more reliable in browser environments, avoids CORS issues
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;
  try {
    const res = await fetch(proxy, { headers: { Accept: 'application/json' } });
    if (res.ok) return res;
    if (res.status === 429 || res.status === 403) {
      logger.warn('Rate limit via proxy, trying direct', { status: res.status });
    }
  } catch (proxyErr) {
    logger.warn('Proxy fetch failed, trying direct', { error: String(proxyErr) });
  }

  // Fallback: direct request
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) return res;
    if (res.status === 429 || res.status === 403) {
      throw new Error('CoinGecko rate limit reached. Please wait 30 seconds and try again.');
    }
    throw new Error(`CoinGecko API error: ${res.status}`);
  } catch (e) {
    if (e instanceof Error && (e.message.includes('rate limit') || e.message.includes('API error'))) {
      throw e;
    }
    throw new Error('Network error. Check your connection and try again.');
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchCoins(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const safe = sanitizeTicker(query);
  const cacheKey = `search:${safe}`;
  const cached = cache.get<SearchResult[]>(cacheKey, 60_000); // 1-min cache for search
  if (cached) return cached;

  const url = `${COINGECKO_BASE}/search?query=${encodeURIComponent(safe)}`;
  logger.debug('searchCoins', { query: safe });

  try {
    const res = await fetchWithFallback(url);
    if (!res.ok) throw new Error('Search failed');
    const data = await res.json();
    const results: SearchResult[] = (data.coins || []).slice(0, 20).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      symbol: (c.symbol as string)?.toUpperCase() || '',
      name: c.name as string,
      thumb: c.thumb as string | undefined,
      market_cap_rank: c.market_cap_rank as number | undefined,
    }));
    cache.set(cacheKey, results);
    return results;
  } catch (err) {
    logger.error('searchCoins failed', err);
    return [];
  }
}

// ─── Market Data ──────────────────────────────────────────────────────────────

export async function getMarketData(coinId: string): Promise<CoinMarketData> {
  const safe = sanitizeTicker(coinId);
  const cacheKey = `market:${safe}`;
  const cached = cache.get<CoinMarketData>(cacheKey, CACHE_TTL);
  if (cached) {
    logger.debug('getMarketData cache hit', { coinId: safe });
    return cached;
  }

  const params = new URLSearchParams({
    vs_currency: 'usd',
    ids: safe,
    order: 'market_cap_desc',
    per_page: '1',
    page: '1',
    sparkline: 'false',
    price_change_percentage: '24h,7d',
    locale: 'en',
  });

  const url = `${COINGECKO_BASE}/coins/markets?${params}`;
  logger.debug('getMarketData fetch', { coinId: safe });

  const res = await fetchWithFallback(url);
  if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`);

  const list = await res.json();
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`No data found for "${coinId}". Check the ticker symbol.`);
  }

  const raw = list[0];
  const data: CoinMarketData = {
    id: raw.id,
    symbol: raw.symbol?.toUpperCase() || '',
    name: raw.name,
    current_price: raw.current_price ?? 0,
    market_cap: raw.market_cap ?? null,
    fully_diluted_valuation: raw.fully_diluted_valuation ?? null,
    total_volume: raw.total_volume ?? null,
    price_change_percentage_24h: raw.price_change_percentage_24h ?? null,
    price_change_percentage_7d_in_currency: raw.price_change_percentage_7d_in_currency ?? null,
    circulating_supply: raw.circulating_supply ?? null,
    total_supply: raw.total_supply ?? null,
    max_supply: raw.max_supply ?? null,
    ath: raw.ath ?? null,
    ath_change_percentage: raw.ath_change_percentage ?? null,
    ath_date: raw.ath_date ?? null,
    image: raw.image ?? null,
    market_cap_rank: raw.market_cap_rank ?? null,
    high_24h: raw.high_24h ?? null,
    low_24h: raw.low_24h ?? null,
  };

  cache.set(cacheKey, data);
  return data;
}

// ─── Ticker Resolution ────────────────────────────────────────────────────────

/**
 * Resolves a ticker symbol or CoinGecko ID to a canonical CoinGecko coin ID.
 *
 * Resolution order:
 * 1. TICKER_ID_MAP lookup — instant, no API call for top-50 coins (Optimization 4)
 * 2. If query looks like a CoinGecko ID already, return as-is
 * 3. Search API with exact symbol match, ranked by market cap
 */
export async function resolveTickerToId(ticker: string): Promise<string> {
  const upper = ticker.toUpperCase().trim();
  const lower = ticker.toLowerCase().trim();

  // 1. Fast path: known ticker map
  if (TICKER_ID_MAP[upper]) {
    logger.debug('resolveTickerToId map hit', { ticker: upper, id: TICKER_ID_MAP[upper] });
    return TICKER_ID_MAP[upper];
  }

  // 2. Looks like a CoinGecko ID already (e.g. "bitcoin", "usd-coin")
  if (isCoinGeckoId(lower) && lower.length > 3) {
    logger.debug('resolveTickerToId direct ID', { id: lower });
    return lower;
  }

  // 3. Search API
  logger.debug('resolveTickerToId search', { ticker: upper });
  const results = await searchCoins(upper);
  if (results.length === 0) throw new Error(`No coin found for ticker "${ticker}"`);

  // Exact symbol matches first
  const exactMatches = results.filter(r => r.symbol === upper);
  if (exactMatches.length > 0) {
    const ranked = exactMatches
      .filter(r => r.market_cap_rank != null)
      .sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999));
    return ranked.length > 0 ? ranked[0].id : exactMatches[0].id;
  }

  // No exact match: highest ranked result
  const allRanked = results
    .filter(r => r.market_cap_rank != null)
    .sort((a, b) => (a.market_cap_rank ?? 9999) - (b.market_cap_rank ?? 9999));
  return allRanked.length > 0 ? allRanked[0].id : results[0].id;
}
