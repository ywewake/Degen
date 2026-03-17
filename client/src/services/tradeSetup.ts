// CryptoAlpha — Trade Setup Engine
// Calculates entry, targets (TP1/TP2/TP3), stop loss, R:R, and position sizing
// All setups enforce minimum 1:3 risk-to-reward ratio

import type { AnalysisResult } from './analysis';
import type { Signal, RiskLevel } from './analysis';

export type TradeDirection = 'LONG' | 'SHORT';
export type TradeTimeframe = '1h' | '4h' | '1d' | '1w';

export interface TradeTarget {
  label: string;       // "TP1", "TP2", "TP3"
  price: number;
  pctGain: number;     // % from entry
  rr: number;          // Risk:Reward ratio at this target
  partial: number;     // Suggested % of position to exit here
}

export interface TradeSetup {
  direction: TradeDirection;
  timeframe: TradeTimeframe;
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  stopLossPct: number;   // % risk from entry
  targets: TradeTarget[];
  riskReward: number;    // Best R:R (TP3)
  positionSizePct: number; // % of portfolio to risk
  maxLoss: number;       // Dollar loss per $1000 invested
  confidence: number;    // 0–100 based on signal alignment
  rationale: string;
  timeframeLabel: string;
  invalidationNote: string;
}

const TF_LABELS: Record<TradeTimeframe, string> = {
  '1h': '1 Hour Scalp',
  '4h': '4 Hour Swing',
  '1d': 'Daily Swing',
  '1w': 'Weekly Position',
};

// ATR proxy: estimate average true range from 24h range and volatility
function estimateATR(
  price: number,
  high24h: number | null,
  low24h: number | null,
  timeframe: TradeTimeframe
): number {
  const range = high24h && low24h ? high24h - low24h : price * 0.05;
  const tfMultiplier: Record<TradeTimeframe, number> = {
    '1h': 0.25,
    '4h': 0.5,
    '1d': 1.0,
    '1w': 2.5,
  };
  return range * tfMultiplier[timeframe];
}

// Stop loss distance based on ATR and risk level
function calcStopDistance(
  atr: number,
  riskLevel: RiskLevel,
  timeframe: TradeTimeframe
): number {
  const riskMultiplier: Record<RiskLevel, number> = {
    LOW: 1.5,
    MEDIUM: 2.0,
    HIGH: 2.5,
  };
  const tfMultiplier: Record<TradeTimeframe, number> = {
    '1h': 0.8,
    '4h': 1.0,
    '1d': 1.2,
    '1w': 1.5,
  };
  return atr * riskMultiplier[riskLevel] * tfMultiplier[timeframe];
}

// Position size: risk 1–2% of portfolio per trade
function calcPositionSize(riskLevel: RiskLevel, confidence: number): number {
  const base: Record<RiskLevel, number> = { LOW: 2.0, MEDIUM: 1.5, HIGH: 1.0 };
  const confBonus = confidence > 70 ? 0.5 : confidence > 50 ? 0.25 : 0;
  return Math.min(base[riskLevel] + confBonus, 3.0);
}

// Calculate signal confidence from analysis
function calcConfidence(result: AnalysisResult, direction: TradeDirection): number {
  const signalMatch = result.signals.filter(s =>
    direction === 'LONG' ? s.signal === 'BUY' : s.signal === 'SELL'
  ).length;
  const sentimentMatch =
    direction === 'LONG'
      ? result.sentiment.trend === 'bullish'
      : result.sentiment.trend === 'bearish';
  const riskOk = result.risk.level !== 'HIGH';

  // Guard against division by zero if signals array is somehow empty
  const signalRatio = result.signals.length > 0 ? signalMatch / result.signals.length : 0;
  let conf = signalRatio * 60;
  if (sentimentMatch) conf += 20;
  if (riskOk) conf += 20;
  return Math.round(Math.min(conf, 100));
}

// Generate rationale text
function buildRationale(
  result: AnalysisResult,
  direction: TradeDirection,
  timeframe: TradeTimeframe,
  confidence: number
): string {
  const tfLabel = TF_LABELS[timeframe];
  const signalCount = result.signals.filter(s =>
    direction === 'LONG' ? s.signal === 'BUY' : s.signal === 'SELL'
  ).length;
  const sentimentCtx =
    result.sentiment.score > 60
      ? 'bullish sentiment'
      : result.sentiment.score < 40
      ? 'bearish sentiment'
      : 'neutral sentiment';
  const riskCtx = result.risk.level.toLowerCase() + ' risk profile';

  return `${tfLabel} ${direction.toLowerCase()} setup. ${signalCount}/4 timeframes confirm ${direction === 'LONG' ? 'buy' : 'sell'} signal. ${sentimentCtx.charAt(0).toUpperCase() + sentimentCtx.slice(1)} with ${riskCtx}. Setup confidence: ${confidence}%.`;
}

// Invalidation note
function buildInvalidation(
  direction: TradeDirection,
  stopLoss: number,
  entryPrice: number
): string {
  const side = direction === 'LONG' ? 'below' : 'above';
  return `Trade invalidated if price closes ${side} $${stopLoss.toFixed(4)} (stop loss). Exit immediately on invalidation — do not average into a losing trade.`;
}

export function generateTradeSetup(
  result: AnalysisResult,
  timeframe: TradeTimeframe,
  direction?: TradeDirection
): TradeSetup {
  const price = result.price;
  const riskLevel = result.risk.level;

  // Determine direction from dominant signal if not specified
  const dir: TradeDirection =
    direction ??
    (result.dominantSignal === 'SELL' ? 'SHORT' : 'LONG');

  const atr = estimateATR(price, result.high24h, result.low24h, timeframe);
  const stopDist = calcStopDistance(atr, riskLevel, timeframe);
  const confidence = calcConfidence(result, dir);

  // Entry zone: ±0.5 ATR from current price
  const entryZoneLow = dir === 'LONG' ? price - atr * 0.3 : price;
  const entryZoneHigh = dir === 'LONG' ? price : price + atr * 0.3;
  const entryPrice = dir === 'LONG' ? price - atr * 0.15 : price + atr * 0.15;

  // Stop loss
  const stopLoss =
    dir === 'LONG' ? entryPrice - stopDist : entryPrice + stopDist;
  const stopLossPct = (Math.abs(entryPrice - stopLoss) / entryPrice) * 100;

  // Targets: enforce minimum 1:3 R:R
  // TP1 = 1:1.5, TP2 = 1:3 (minimum), TP3 = 1:5
  const riskAmt = Math.abs(entryPrice - stopLoss);
  const tp1Price =
    dir === 'LONG' ? entryPrice + riskAmt * 1.5 : entryPrice - riskAmt * 1.5;
  const tp2Price =
    dir === 'LONG' ? entryPrice + riskAmt * 3 : entryPrice - riskAmt * 3;
  const tp3Price =
    dir === 'LONG' ? entryPrice + riskAmt * 5 : entryPrice - riskAmt * 5;

  const targets: TradeTarget[] = [
    {
      label: 'TP1',
      price: tp1Price,
      pctGain: ((Math.abs(tp1Price - entryPrice)) / entryPrice) * 100,
      rr: 1.5,
      partial: 30,
    },
    {
      label: 'TP2',
      price: tp2Price,
      pctGain: ((Math.abs(tp2Price - entryPrice)) / entryPrice) * 100,
      rr: 3.0,
      partial: 40,
    },
    {
      label: 'TP3',
      price: tp3Price,
      pctGain: ((Math.abs(tp3Price - entryPrice)) / entryPrice) * 100,
      rr: 5.0,
      partial: 30,
    },
  ];

  const positionSizePct = calcPositionSize(riskLevel, confidence);
  const maxLoss = (positionSizePct / 100) * 1000 * (stopLossPct / 100);

  return {
    direction: dir,
    timeframe,
    entryPrice,
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    stopLossPct,
    targets,
    riskReward: 5.0,
    positionSizePct,
    maxLoss,
    confidence,
    rationale: buildRationale(result, dir, timeframe, confidence),
    timeframeLabel: TF_LABELS[timeframe],
    invalidationNote: buildInvalidation(dir, stopLoss, entryPrice),
  };
}
