// CryptoAlpha — Input Validation Utilities
// Section 4, Step 1 + Bug 4 fix: validateTicker was imported but missing

import { MAX_TICKER_LENGTH } from './constants';

/**
 * Validates a ticker symbol or CoinGecko ID string.
 * Accepts: letters, numbers, hyphens. Max 10 chars for tickers, longer for IDs.
 */
export function validateTicker(ticker: string): boolean {
  if (!ticker || typeof ticker !== 'string') return false;
  const cleaned = ticker.trim();
  if (cleaned.length === 0 || cleaned.length > 50) return false;
  // Allow hyphens for CoinGecko IDs (e.g. "bitcoin", "usd-coin")
  return /^[A-Za-z0-9-]{1,50}$/.test(cleaned);
}

/**
 * Validates a short ticker symbol (e.g. BTC, ETH).
 * Stricter: no hyphens, max MAX_TICKER_LENGTH chars.
 */
export function validateTickerSymbol(ticker: string): boolean {
  if (!ticker || typeof ticker !== 'string') return false;
  const cleaned = ticker.trim();
  return /^[A-Za-z0-9]{1,10}$/.test(cleaned) && cleaned.length <= MAX_TICKER_LENGTH;
}

/**
 * Sanitizes a ticker for use in API calls.
 * Strips anything that isn't alphanumeric or a hyphen.
 */
export function sanitizeTicker(ticker: string): string {
  return ticker.replace(/[^a-zA-Z0-9-]/g, '').toLowerCase().slice(0, 50);
}

/**
 * Returns true if the string looks like a CoinGecko coin ID
 * (all lowercase, may contain hyphens, e.g. "bitcoin", "usd-coin").
 */
export function isCoinGeckoId(query: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(query.trim());
}

/**
 * Validates a price value — must be a finite positive number.
 */
export function validatePrice(price: unknown): price is number {
  return typeof price === 'number' && isFinite(price) && price > 0;
}

/**
 * Validates a portfolio balance — must be a finite positive number within allowed range.
 */
export function validateBalance(balance: unknown, min = 100, max = 1_000_000): balance is number {
  return typeof balance === 'number' && isFinite(balance) && balance >= min && balance <= max;
}
