// CryptoAlpha — Shared Constants
// Section 4, Step 1: Core utilities

export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in ms
export const WATCHLIST_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for watchlist
export const COINGECKO_CACHE_KEY = 'coingecko_cache'; // kept for compat (unused in current impl)
export const MAX_TICKER_LENGTH = 10;
export const TIMEFRAMES = ['1h', '4h', '1d', '1w'] as const;
export const SIGNAL_THRESHOLDS = { BUY: 60, SELL: 40 } as const;
export const MAIN_SIGNAL_TIMEFRAME = '1d' as const;

// Well-known ticker → CoinGecko ID map (top 50 by market cap)
// Prevents an extra search API call for common tickers
export const TICKER_ID_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  USDC: 'usd-coin',
  XRP: 'ripple',
  DOGE: 'dogecoin',
  TON: 'the-open-network',
  ADA: 'cardano',
  TRX: 'tron',
  AVAX: 'avalanche-2',
  SHIB: 'shiba-inu',
  DOT: 'polkadot',
  LINK: 'chainlink',
  MATIC: 'matic-network',
  POL: 'matic-network',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  ETC: 'ethereum-classic',
  NEAR: 'near',
  APT: 'aptos',
  ICP: 'internet-computer',
  FIL: 'filecoin',
  ARB: 'arbitrum',
  OP: 'optimism',
  INJ: 'injective-protocol',
  SUI: 'sui',
  SEI: 'sei-network',
  PEPE: 'pepe',
  WIF: 'dogwifcoin',
  BONK: 'bonk',
  FLOKI: 'floki',
  JUP: 'jupiter-exchange-solana',
  PYTH: 'pyth-network',
  JTO: 'jito-governance-token',
  RENDER: 'render-token',
  FET: 'fetch-ai',
  GRT: 'the-graph',
  AAVE: 'aave',
  MKR: 'maker',
  SNX: 'havven',
  CRV: 'curve-dao-token',
  LDO: 'lido-dao',
  RUNE: 'thorchain',
  ALGO: 'algorand',
  VET: 'vechain',
};

// Paper trading defaults
export const DEFAULT_PAPER_BALANCE = 10_000;
export const MIN_PAPER_BALANCE = 100;
export const MAX_PAPER_BALANCE = 1_000_000;

// Risk/reward
export const MIN_RISK_REWARD = 1.5;
export const TARGET_RISK_REWARD = 3.0;
