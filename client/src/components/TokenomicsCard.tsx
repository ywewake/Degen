// TokenomicsCard — Shows price, market data, supply info
// Design: Terminal dark, monospaced numbers, color-coded price change

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatPrice, formatLargeNumber, formatSupply, formatPercent } from '@/lib/format';
import type { AnalysisResult } from '@/services/analysis';

interface Props {
  result: AnalysisResult;
}

export function TokenomicsCard({ result }: Props) {
  const change = result.priceChange24h;
  const isUp = change != null && change > 0;
  const isDown = change != null && change < 0;

  const changeColor = isUp
    ? 'text-[oklch(0.78_0.22_155)]'
    : isDown
    ? 'text-[oklch(0.65_0.22_27)]'
    : 'text-muted-foreground';

  const ChangeIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  const metrics = [
    { label: 'Market Cap', value: formatLargeNumber(result.marketCap) },
    { label: 'FDV', value: formatLargeNumber(result.fdv) },
    { label: '24h Volume', value: formatLargeNumber(result.volume24h) },
    { label: 'ATH', value: formatPrice(result.ath) },
    { label: 'Circ. Supply', value: formatSupply(result.circulatingSupply) },
    { label: 'Total Supply', value: formatSupply(result.totalSupply) },
  ];

  return (
    <div className="data-card p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {result.image && (
            <img
              src={result.image}
              alt={result.name}
              className="w-9 h-9 rounded-full"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-xl text-foreground tracking-tight">
                {result.ticker}
              </span>
              {result.marketCapRank && (
                <span className="text-xs font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
                  #{result.marketCapRank}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{result.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono font-bold text-xl text-foreground">
            {formatPrice(result.price)}
          </p>
          <div className={`flex items-center justify-end gap-1 mt-0.5 ${changeColor}`}>
            <ChangeIcon className="w-3.5 h-3.5" />
            <span className="font-mono text-sm font-medium">
              {formatPercent(change)}
            </span>
          </div>
        </div>
      </div>

      {/* 24h range bar */}
      {result.high24h != null && result.low24h != null && result.high24h > result.low24h && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-muted-foreground font-mono mb-1">
            <span>{formatPrice(result.low24h)}</span>
            <span className="text-muted-foreground/60">24h Range</span>
            <span>{formatPrice(result.high24h)}</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[oklch(0.65_0.22_27)] to-[oklch(0.78_0.22_155)]"
              style={{
                width: `${Math.min(100, Math.max(0, ((result.price - result.low24h) / (result.high24h - result.low24h)) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-x-3 gap-y-3">
        {metrics.map(({ label, value }) => (
          <div key={label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
              {label}
            </p>
            <p className="font-mono font-semibold text-sm text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* ATH change */}
      {result.athChangePercent != null && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">From ATH</span>
            <span className={`font-mono text-sm font-semibold ${result.athChangePercent < 0 ? 'text-[oklch(0.65_0.22_27)]' : 'text-[oklch(0.78_0.22_155)]'}`}>
              {formatPercent(result.athChangePercent)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
