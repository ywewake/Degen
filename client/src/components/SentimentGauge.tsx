// SentimentGauge — Circular arc gauge for market sentiment score
// Design: Terminal dark, animated SVG arc, color-coded

import type { SentimentData } from '@/services/analysis';

interface Props {
  sentiment: SentimentData;
}

export function SentimentGauge({ sentiment }: Props) {
  const score = sentiment.score;
  const isGreed = score > 55;
  const isFear = score < 45;

  const color = isGreed
    ? 'oklch(0.78 0.22 155)'
    : isFear
    ? 'oklch(0.65 0.22 27)'
    : 'oklch(0.78 0.18 75)';

  const textColor = isGreed
    ? 'text-[oklch(0.78_0.22_155)]'
    : isFear
    ? 'text-[oklch(0.65_0.22_27)]'
    : 'text-[oklch(0.78_0.18_75)]';

  // SVG arc: circumference of r=36 circle = 226.2
  const circumference = 2 * Math.PI * 36;
  const dashArray = (score / 100) * circumference;

  return (
    <div className="data-card p-3 flex flex-col items-center">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 self-start">
        Price Momentum Score
      </h3>

      {/* Gauge */}
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          {/* Track */}
          <circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke="oklch(0.22 0.01 264)"
            strokeWidth="6"
          />
          {/* Arc */}
          <circle
            cx="40" cy="40" r="36"
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dashArray} ${circumference}`}
            className="gauge-arc"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono font-bold text-lg leading-none ${textColor}`}>
            {score.toFixed(0)}
          </span>
          <span className="text-[9px] text-muted-foreground mt-0.5">/ 100</span>
        </div>
      </div>

      <p className={`text-xs font-semibold mt-1 ${textColor}`}>{sentiment.label}</p>
      <p className="text-[10px] text-muted-foreground capitalize mt-0.5">
        {sentiment.trend} momentum
      </p>
    </div>
  );
}
