// CryptoAlpha — Low-Cap Breakout Watchlist Service
// Independent audit fixes:
//   - Replaced all `any` types with proper CoinGeckoMarketItem interface
//   - Uses CacheService singleton instead of module-level variable
//   - Proxy-first fetch strategy (consistent with coingecko.ts)
//   - Fixed getRiskLevel: $100M+ should be MEDIUM, not HIGH
//   - Added null guard for market_cap in filter

import { cache } from './cache';
import { WATCHLIST_CACHE_TTL } from '@/utils/constants';
import { logger } from '@/utils/logger';

export type BreakoutDirection = 'LONG' | 'SHORT';

export interface BreakoutCandidate {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange1h: number;
  priceChange24h: number;
  priceChange7d: number;
  volumeToMcapRatio: number;
  direction: BreakoutDirection;
  score: number;
  signals: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  rank: number;
}

export interface WatchlistData {
  longs: BreakoutCandidate[];
  shorts: BreakoutCandidate[];
  fetchedAt: number;
}

// Typed CoinGecko /coins/markets response item
interface CoinGeckoMarketItem {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number | null;
  market_cap_rank: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  price_change_percentage_1h_in_currency: number | null;
  price_change_percentage_7d_in_currency: number | null;
  ath_change_percentage: number | null;
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

async function fetchPage(page: number): Promise<CoinGeckoMarketItem[]> {
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d`;
  const proxy = `https://corsproxy.io/?${encodeURIComponent(url)}`;

  // Proxy-first strategy (consistent with coingecko.ts)
  try {
    const res = await fetch(proxy, { headers: { Accept: 'application/json' } });
    if (res.ok) return res.json();
  } catch {
    logger.warn('Watchlist proxy failed, trying direct', { page });
  }

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    if (res.status === 429 || res.status === 403) throw new Error('Rate limited');
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchLowCapCoins(): Promise<CoinGeckoMarketItem[]> {
  // Fetch 2 pages sequentially to stay within CoinGecko free tier (30 req/min)
  logger.debug('fetchLowCapCoins start');
  const page2 = await fetchPage(2);
  await new Promise(r => setTimeout(r, 2000));
  const page3 = await fetchPage(3);
  return [...page2, ...page3].filter(Boolean);
}

function scoreLong(coin: CoinGeckoMarketItem): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const change1h = coin.price_change_percentage_1h_in_currency ?? 0;
  const change24h = coin.price_change_percentage_24h ?? 0;
  const change7d = coin.price_change_percentage_7d_in_currency ?? 0;
  const volToMcap = (coin.total_volume ?? 0) / (coin.market_cap || 1);

  if (change1h > 3) { score += 25; signals.push(`+${change1h.toFixed(1)}% in 1h`); }
  else if (change1h > 1) { score += 12; signals.push(`+${change1h.toFixed(1)}% in 1h`); }

  if (change24h > 10) { score += 25; signals.push(`+${change24h.toFixed(1)}% in 24h`); }
  else if (change24h > 5) { score += 15; signals.push(`+${change24h.toFixed(1)}% in 24h`); }
  else if (change24h > 2) { score += 8; signals.push(`+${change24h.toFixed(1)}% in 24h`); }

  if (change7d > 20) { score += 15; signals.push(`+${change7d.toFixed(1)}% weekly trend`); }
  else if (change7d > 10) { score += 10; signals.push(`+${change7d.toFixed(1)}% weekly trend`); }
  else if (change7d < -10) { score -= 10; }

  if (volToMcap > 0.5) { score += 25; signals.push(`Volume ${(volToMcap * 100).toFixed(0)}% of MCap`); }
  else if (volToMcap > 0.25) { score += 15; signals.push(`Volume ${(volToMcap * 100).toFixed(0)}% of MCap`); }
  else if (volToMcap > 0.1) { score += 8; signals.push(`Volume ${(volToMcap * 100).toFixed(0)}% of MCap`); }

  const athChange = coin.ath_change_percentage ?? -100;
  if (athChange > -20) { score += 10; signals.push('Near ATH recovery zone'); }

  return { score: Math.min(Math.max(score, 0), 100), signals };
}

function scoreShort(coin: CoinGeckoMarketItem): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  const change1h = coin.price_change_percentage_1h_in_currency ?? 0;
  const change24h = coin.price_change_percentage_24h ?? 0;
  const change7d = coin.price_change_percentage_7d_in_currency ?? 0;
  const volToMcap = (coin.total_volume ?? 0) / (coin.market_cap || 1);

  if (change1h < -3) { score += 25; signals.push(`${change1h.toFixed(1)}% in 1h`); }
  else if (change1h < -1) { score += 12; signals.push(`${change1h.toFixed(1)}% in 1h`); }

  if (change24h < -10) { score += 25; signals.push(`${change24h.toFixed(1)}% in 24h`); }
  else if (change24h < -5) { score += 15; signals.push(`${change24h.toFixed(1)}% in 24h`); }
  else if (change24h < -2) { score += 8; signals.push(`${change24h.toFixed(1)}% in 24h`); }

  if (change7d < -20) { score += 15; signals.push(`${change7d.toFixed(1)}% weekly decline`); }
  else if (change7d < -10) { score += 10; signals.push(`${change7d.toFixed(1)}% weekly decline`); }
  else if (change7d > 10) { score -= 10; }

  if (volToMcap > 0.5) { score += 25; signals.push(`Volume ${(volToMcap * 100).toFixed(0)}% of MCap`); }
  else if (volToMcap > 0.25) { score += 15; signals.push(`Volume ${(volToMcap * 100).toFixed(0)}% of MCap`); }
  else if (volToMcap > 0.1) { score += 8; signals.push(`Volume ${(volToMcap * 100).toFixed(0)}% of MCap`); }

  const athChange = coin.ath_change_percentage ?? 0;
  if (athChange < -70) { score += 10; signals.push(`${Math.abs(athChange).toFixed(0)}% below ATH`); }

  return { score: Math.min(Math.max(score, 0), 100), signals };
}

// Fixed: $100M+ = MEDIUM (was incorrectly returning HIGH), $20M–$100M = HIGH, <$20M = HIGH
function getRiskLevel(coin: CoinGeckoMarketItem): 'LOW' | 'MEDIUM' | 'HIGH' {
  const mcap = coin.market_cap ?? 0;
  if (mcap > 100_000_000) return 'MEDIUM';
  return 'HIGH';
}

const WATCHLIST_CACHE_KEY = 'watchlist:lowcap';

export async function fetchBreakoutWatchlist(forceRefresh = false): Promise<WatchlistData> {
  if (!forceRefresh) {
    const cached = cache.get<WatchlistData>(WATCHLIST_CACHE_KEY, WATCHLIST_CACHE_TTL);
    if (cached) {
      logger.debug('fetchBreakoutWatchlist cache hit');
      return cached;
    }
  }

  const coins = await fetchLowCapCoins();

  // Filter: market cap $5M–$500M, must have volume data, positive price
  const filtered = coins.filter(c =>
    c.market_cap != null &&
    c.market_cap >= 5_000_000 &&
    c.market_cap <= 500_000_000 &&
    (c.total_volume ?? 0) > 100_000 &&
    c.current_price > 0
  );

  logger.debug('watchlist filtered coins', { count: filtered.length });

  const longCandidates: BreakoutCandidate[] = [];
  const shortCandidates: BreakoutCandidate[] = [];

  for (const coin of filtered) {
    const volToMcap = (coin.total_volume ?? 0) / (coin.market_cap || 1);
    const change24h = coin.price_change_percentage_24h ?? 0;

    const base: Omit<BreakoutCandidate, 'direction' | 'score' | 'signals'> = {
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      price: coin.current_price,
      marketCap: coin.market_cap ?? 0,
      volume24h: coin.total_volume ?? 0,
      priceChange1h: coin.price_change_percentage_1h_in_currency ?? 0,
      priceChange24h: change24h,
      priceChange7d: coin.price_change_percentage_7d_in_currency ?? 0,
      volumeToMcapRatio: volToMcap,
      riskLevel: getRiskLevel(coin),
      rank: coin.market_cap_rank ?? 999,
    };

    if (change24h > 0) {
      const { score, signals } = scoreLong(coin);
      if (score >= 30) {
        longCandidates.push({ ...base, direction: 'LONG', score, signals });
      }
    }

    if (change24h < 0) {
      const { score, signals } = scoreShort(coin);
      if (score >= 30) {
        shortCandidates.push({ ...base, direction: 'SHORT', score, signals });
      }
    }
  }

  const longs = longCandidates.sort((a, b) => b.score - a.score).slice(0, 10);
  const shorts = shortCandidates.sort((a, b) => b.score - a.score).slice(0, 10);

  const result: WatchlistData = { longs, shorts, fetchedAt: Date.now() };
  cache.set(WATCHLIST_CACHE_KEY, result);
  return result;
}

export function formatMcap(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${(n / 1e3).toFixed(0)}K`;
}
