// CryptoAlpha — Core Analysis Engine
// Signals, Sentiment, Risk, Action Plan

import type { CoinMarketData } from './coingecko';

export type TimeFrame = '1h' | '4h' | '1d' | '1w';
export type Signal = 'BUY' | 'SELL' | 'NEUTRAL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type SentimentTrend = 'bullish' | 'bearish' | 'neutral';

export interface SignalData {
  timeframe: TimeFrame;
  signal: Signal;
  strength: number; // 0–1
  momentumScore: number;  // Momentum proxy from price data (NOT real RSI)
  trendDirection: number; // Trend proxy from price change (NOT real MACD)
  label: string;
}

export interface SentimentData {
  score: number; // 0–100
  trend: SentimentTrend;
  momentum: number;
  volumeTrend: number;
  label: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  score: number; // 0–1
  volatility: number;
  marketCapScore: number;
  liquidityScore: number;
  description: string;
}

export interface AnalysisResult {
  coinId: string;
  ticker: string;
  name: string;
  price: number;
  priceChange24h: number | null;
  priceChange7d: number | null;
  high24h: number | null;
  low24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athChangePercent: number | null;
  image: string | null;
  marketCapRank: number | null;
  signals: SignalData[];
  sentiment: SentimentData;
  risk: RiskAssessment;
  actionPlan: string;
  dominantSignal: Signal;
  timestamp: number;
}

// ─── Signal Engine ────────────────────────────────────────────────────────────

const TIMEFRAME_LABELS: Record<TimeFrame, string> = {
  '1h': '1 Hour',
  '4h': '4 Hours',
  '1d': '1 Day',
  '1w': '1 Week',
};

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function calculateTrueRSI(closes: number[], periods: number = 14): number {
  if (closes.length <= periods) return 50;
  
  let gains = 0, losses = 0;
  
  for (let i = 1; i <= periods; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      gains += diff;
    } else {
      losses -= diff;
    }
  }
  
  let avgGain = gains / periods;
  let avgLoss = losses / periods;
  
  for (let i = periods + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    
    avgGain = (avgGain * (periods - 1) + gain) / periods;
    avgLoss = (avgLoss * (periods - 1) + loss) / periods;
  }
  
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calcRSI(changes: number[]): number {
  if (changes.length === 0) return 50;
  const gains = changes.filter(c => c > 0).reduce((s, c) => s + c, 0);
  const losses = changes.filter(c => c < 0).reduce((s, c) => s + Math.abs(c), 0);
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return gains > 0 ? 85 : 50;
  const rs = avgGain / avgLoss;
  return clamp(100 - 100 / (1 + rs), 0, 100);
}

function volumeScore(volume: number | null, marketCap: number | null): number {
  if (!volume || !marketCap || marketCap === 0) return 1;
  return volume / marketCap;
}

function determineSignal(rsi: number, priceChange: number, volScore: number): Signal {
  if (rsi < 30 && priceChange > -5) return 'BUY';
  if (rsi > 70 && priceChange > 5) return 'SELL';
  if (rsi < 40) return 'BUY';
  if (rsi > 60) return 'SELL';
  if (volScore > 1.5 && priceChange > 2) return 'BUY';
  if (volScore < 0.5 && priceChange < -2) return 'SELL';
  return 'NEUTRAL';
}

function signalStrength(rsi: number, priceChange: number, volScore: number): number {
  let s = 0.5;
  if (rsi < 30 || rsi > 70) s += 0.25;
  else if (rsi < 40 || rsi > 60) s += 0.1;
  if (Math.abs(priceChange) > 10) s += 0.2;
  else if (Math.abs(priceChange) > 5) s += 0.1;
  if (volScore > 1.5) s += 0.1;
  return clamp(s, 0.1, 1.0);
}

export function generateSignals(data: CoinMarketData): SignalData[] {
  const p24 = data.price_change_percentage_24h ?? 0;
  const p7d = data.price_change_percentage_7d_in_currency ?? 0;
  const vs = volumeScore(data.total_volume, data.market_cap);

  const configs: Array<{ tf: TimeFrame; changes: number[]; pc: number; macdMult: number }> = [
    { tf: '1h', changes: [p24 / 4], pc: p24 / 4, macdMult: 1 },
    { tf: '4h', changes: [p24 / 2, p24], pc: p24 / 2, macdMult: 0.8 },
    { tf: '1d', changes: [p24, p7d / 7], pc: p24, macdMult: 1 },
    { tf: '1w', changes: [p7d, p24 * 1.5], pc: p7d, macdMult: 1.5 },
  ];

  return configs.map(({ tf, changes, pc, macdMult }) => {
    const rsi = calcRSI(changes);
    const sig = determineSignal(rsi, pc, vs);
    const strength = signalStrength(rsi, pc, vs);
    return {
      timeframe: tf,
      signal: sig,
      strength,
      momentumScore: rsi,
      trendDirection: pc * macdMult,
      label: TIMEFRAME_LABELS[tf],
    };
  });
}

// ─── Sentiment Engine (simulated via price momentum) ─────────────────────────

function sentimentLabel(score: number): string {
  if (score >= 75) return 'Extreme Greed';
  if (score >= 60) return 'Greed';
  if (score >= 45) return 'Neutral';
  if (score >= 30) return 'Fear';
  return 'Extreme Fear';
}

export function generateSentiment(data: CoinMarketData): SentimentData {
  const p24 = data.price_change_percentage_24h ?? 0;
  const p7d = data.price_change_percentage_7d_in_currency ?? 0;
  const vs = volumeScore(data.total_volume, data.market_cap);

  // Score: 50 base + price momentum + volume signal
  let score = 50;
  score += clamp(p24 * 1.5, -20, 20);
  score += clamp(p7d * 0.8, -15, 15);
  score += clamp((vs - 1) * 10, -10, 10);
  score = clamp(score, 0, 100);

  const trend: SentimentTrend = score > 55 ? 'bullish' : score < 45 ? 'bearish' : 'neutral';
  const momentum = clamp(50 + p24 * 2, 0, 100);
  const volumeTrend = clamp(vs * 100, 0, 200);

  return {
    score,
    trend,
    momentum,
    volumeTrend,
    label: sentimentLabel(score),
  };
}

// ─── Risk Engine ──────────────────────────────────────────────────────────────

function assessVolatility(p24: number | null, p7d: number | null): number {
  const v24 = Math.abs(p24 ?? 0);
  const v7d = Math.abs(p7d ?? 0);
  const avg = (v24 + v7d / 7) / 2;
  if (avg > 15) return 1.0;
  if (avg > 8) return 0.75;
  if (avg > 4) return 0.5;
  if (avg > 2) return 0.3;
  return 0.1;
}

function assessMarketCap(mc: number | null): number {
  if (!mc) return 0.8;
  if (mc > 100e9) return 0.1;
  if (mc > 10e9) return 0.25;
  if (mc > 1e9) return 0.45;
  if (mc > 100e6) return 0.65;
  if (mc > 10e6) return 0.8;
  return 1.0;
}

function assessLiquidity(volume: number | null, mc: number | null): number {
  if (!volume || !mc || mc === 0) return 0.8;
  const ratio = volume / mc;
  if (ratio > 0.5) return 0.1;
  if (ratio > 0.2) return 0.2;
  if (ratio > 0.1) return 0.4;
  if (ratio > 0.05) return 0.6;
  if (ratio > 0.01) return 0.8;
  return 1.0;
}

export function generateRisk(data: CoinMarketData): RiskAssessment {
  const vol = assessVolatility(data.price_change_percentage_24h, data.price_change_percentage_7d_in_currency);
  const mcScore = assessMarketCap(data.market_cap);
  const liqScore = assessLiquidity(data.total_volume, data.market_cap);
  const score = vol * 0.4 + mcScore * 0.35 + liqScore * 0.25;

  const level: RiskLevel = score > 0.6 ? 'HIGH' : score > 0.3 ? 'MEDIUM' : 'LOW';
  const descriptions: Record<RiskLevel, string> = {
    LOW: 'Established asset with healthy liquidity and low volatility.',
    MEDIUM: 'Moderate risk — watch for volume and volatility shifts.',
    HIGH: 'High volatility — size positions carefully, use stop losses.',
  };

  return {
    level,
    score,
    volatility: vol,
    marketCapScore: mcScore,
    liquidityScore: liqScore,
    description: descriptions[level],
  };
}

// ─── Action Plan Generator ────────────────────────────────────────────────────

export function generateActionPlan(
  signal: Signal,
  risk: RiskLevel,
  priceChange24h: number,
  sentiment: SentimentData
): string {
  const riskMultiplier = risk === 'LOW' ? 1.0 : risk === 'MEDIUM' ? 0.6 : 0.3;
  const positionSize = riskMultiplier === 1 ? '2–3%' : riskMultiplier === 0.6 ? '1–2%' : '0.5–1%';
  const sCtx = sentiment.trend;

  if (signal === 'BUY') {
    const entry = priceChange24h < -5 ? 'dips' : 'current levels';
    if (sCtx === 'bullish') {
      return `Accumulate small positions on ${entry}. Position size: ${positionSize} of portfolio. Set stop loss 7–10% below entry. Take partial profits at 15–25% gains. Bullish momentum supports higher targets — trail your stop as it runs.`;
    } else if (sCtx === 'bearish') {
      return `Wait for stronger reversal confirmation before entering. If trading, use tight 5% stops. Position size: ${positionSize}. Watch for volume confirmation on breakout. Bearish backdrop — be cautious with size.`;
    } else {
      return `Build position gradually on ${entry}. Position size: ${positionSize}. Stop loss 7–10% below entry. Target initial exit at 12–18% gains. Stay flexible — market sentiment could shift quickly.`;
    }
  }

  if (signal === 'SELL') {
    const exit = priceChange24h > 5 ? 'weakness' : 'any strength';
    if (sCtx === 'bearish') {
      return `Reduce exposure into strength. Scale out 30–40% on any rally. Set trailing stop 8–12% above entry. Bearish sentiment suggests lower prices ahead — be patient and let the trade develop.`;
    } else if (sCtx === 'bullish') {
      return `Don't chase shorts into a bull market. Consider covering on ${exit}. Risk/reward is unfavorable for shorts here. Wait for clearer bearish signals before adding downside exposure.`;
    } else {
      return `Take profits on strength into ${exit}. Exit 50% if up 5–8%. Let 30% run with trailing stop. Hold 20% for capitulation plays. Monitor for volume confirmation of sell signals.`;
    }
  }

  // NEUTRAL
  const dir = priceChange24h > 2 ? 'upside' : priceChange24h < -2 ? 'downside' : 'sideways';
  const action = sentiment.score > 55 ? 'favor longs' : sentiment.score < 45 ? 'favor shorts' : 'remain flexible';
  return `Market showing ${dir} bias. ${action.charAt(0).toUpperCase() + action.slice(1)} for breakout trades. Set alerts at key resistance/support levels. Avoid wide stops. Enter only on confirmed breakouts with volume. Stay patient for clearer directional signals.`;
}

// ─── Dominant Signal ──────────────────────────────────────────────────────────

export function getDominantSignal(signals: SignalData[]): Signal {
  const counts = { BUY: 0, SELL: 0, NEUTRAL: 0 };
  signals.forEach(s => counts[s.signal]++);
  if (counts.BUY > counts.SELL && counts.BUY > counts.NEUTRAL) return 'BUY';
  if (counts.SELL > counts.BUY && counts.SELL > counts.NEUTRAL) return 'SELL';
  return 'NEUTRAL';
}

// ─── Full Analysis ────────────────────────────────────────────────────────────

export function analyzeMarketData(data: CoinMarketData): AnalysisResult {
  const signals = generateSignals(data);
  const sentiment = generateSentiment(data);
  const risk = generateRisk(data);
  const dominantSignal = getDominantSignal(signals);
  const actionPlan = generateActionPlan(
    dominantSignal,
    risk.level,
    data.price_change_percentage_24h ?? 0,
    sentiment
  );

  return {
    coinId: data.id,
    ticker: data.symbol,
    name: data.name,
    price: data.current_price,
    priceChange24h: data.price_change_percentage_24h,
    priceChange7d: data.price_change_percentage_7d_in_currency,
    high24h: data.high_24h,
    low24h: data.low_24h,
    marketCap: data.market_cap,
    fdv: data.fully_diluted_valuation,
    volume24h: data.total_volume,
    circulatingSupply: data.circulating_supply,
    totalSupply: data.total_supply,
    maxSupply: data.max_supply,
    ath: data.ath,
    athChangePercent: data.ath_change_percentage,
    image: data.image,
    marketCapRank: data.market_cap_rank,
    signals,
    sentiment,
    risk,
    actionPlan,
    dominantSignal,
    timestamp: Date.now(),
  };
}
