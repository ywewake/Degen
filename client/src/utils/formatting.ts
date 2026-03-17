// CryptoAlpha — Formatting Utilities
// Section 4, Step 1: Core utilities
// Note: lib/format.ts contains the primary implementations used by components.
// This file re-exports them + adds the review-spec additions for any future imports
// from src/utils/formatting.ts.

export {
  formatPrice,
  formatLargeNumber,
  formatSupply,
  formatPercent,
  formatTimestamp,
} from '@/lib/format';

/**
 * Formats a currency value with B/M/K suffix.
 * Alias for formatLargeNumber — matches the review spec naming.
 */
export function formatCurrency(value: number | null | undefined, decimals = 2): string {
  if (value == null) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(decimals)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(decimals)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(decimals)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(decimals)}K`;
  return `$${value.toFixed(decimals)}`;
}

/**
 * Formats a percentage change with sign prefix.
 * Alias matching review spec signature.
 */
export function formatPct(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Formats a supply number (no $ prefix).
 * Matches review spec formatSupply signature.
 */
export function formatSupplyValue(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Formats a Unix timestamp (ms) as a locale time string.
 */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Formats a number as a compact string (e.g. 1.2M, 3.4B).
 */
export function formatCompact(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}
