// CryptoAlpha — Equity Curve Chart (PRO Feature)
// Shows cumulative portfolio balance over all closed paper trades using Recharts.

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { PaperPortfolio } from '@/services/paperTrading';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  portfolio: PaperPortfolio;
}

interface CurvePoint {
  label: string;
  balance: number;
  pnl: number;
  tradeNum: number;
}

export function EquityCurve({ portfolio }: Props) {
  const data = useMemo<CurvePoint[]>(() => {
    const closed = portfolio.trades
      .filter(t => t.status === 'CLOSED' || t.status === 'STOPPED_OUT')
      .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));
    if (closed.length === 0) return [];

    let runningBalance = portfolio.startingBalance;
    const points: CurvePoint[] = [
      { label: 'Start', balance: runningBalance, pnl: 0, tradeNum: 0 },
    ];

    closed.forEach((trade, i) => {
      const pnl = trade.pnlDollar ?? 0;
      runningBalance += pnl;
      points.push({
        label: `T${i + 1}`,
        balance: Math.round(runningBalance * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        tradeNum: i + 1,
      });
    });

    return points;
  }, [portfolio.trades, portfolio.startingBalance]);

  const totalPnl = portfolio.balance - portfolio.startingBalance;
  const isUp = totalPnl >= 0;
  const pnlPct = portfolio.startingBalance > 0
    ? ((totalPnl / portfolio.startingBalance) * 100).toFixed(2)
    : '0.00';

  const lineColor = isUp ? 'oklch(0.75 0.22 145)' : 'oklch(0.65 0.22 27)';

  const closedTrades = portfolio.trades.filter(t => t.status === 'CLOSED' || t.status === 'STOPPED_OUT');
  const bestTrade = closedTrades.length > 0
    ? Math.max(...closedTrades.map(t => t.pnlDollar ?? 0))
    : 0;
  const winCount = closedTrades.filter(t => (t.pnlDollar ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? Math.round((winCount / closedTrades.length) * 100) : 0;

  if (data.length < 2) {
    return (
      <div className="data-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-[oklch(0.78_0.22_155)]" />
          <span className="text-sm font-semibold text-foreground">Equity Curve</span>
          <span className="text-[10px] font-mono text-muted-foreground ml-auto">PRO</span>
        </div>
        <div className="text-center py-8">
          <Minus className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground font-mono">No closed trades yet</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Close paper trades to see your equity curve</p>
        </div>
      </div>
    );
  }

  return (
    <div className="data-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isUp ? (
            <TrendingUp className="w-4 h-4 text-[oklch(0.75_0.22_145)]" />
          ) : (
            <TrendingDown className="w-4 h-4 text-[oklch(0.65_0.22_27)]" />
          )}
          <span className="text-sm font-semibold text-foreground">Equity Curve</span>
        </div>
        <div className="text-right">
          <div className={`text-sm font-mono font-bold ${isUp ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
            {isUp ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
          <div className={`text-[10px] font-mono ${isUp ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
            {isUp ? '+' : ''}{pnlPct}% total return
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Trades', value: closedTrades.length },
          { label: 'Win Rate', value: `${winRate}%` },
          {
            label: 'Best Trade',
            value: closedTrades.length > 0 ? `+$${bestTrade.toFixed(2)}` : '$0',
          },
        ].map(stat => (
          <div key={stat.label} className="bg-secondary/30 rounded p-2 text-center">
            <div className="text-xs font-mono font-bold text-foreground">{stat.value}</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: 'oklch(0.55 0.016 285.938)', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'oklch(0.55 0.016 285.938)', fontFamily: 'monospace' }}
              axisLine={false}
              tickLine={false}
              width={55}
              tickFormatter={v => `$${v.toLocaleString()}`}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: 'oklch(0.21 0.006 285.885)',
                border: '1px solid oklch(1 0 0 / 10%)',
                borderRadius: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
              }}
              labelStyle={{ color: 'oklch(0.85 0.005 65)', marginBottom: '2px' }}
              formatter={(value: number, name: string) => {
                if (name === 'balance') return [`$${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Balance'];
                return [`${value >= 0 ? '+' : ''}$${value.toFixed(2)}`, 'Trade P&L'];
              }}
            />
            <ReferenceLine
              y={portfolio.startingBalance}
              stroke="oklch(1 0 0 / 15%)"
              strokeDasharray="3 3"
            />
            <Line
              type="monotone"
              dataKey="balance"
              stroke={lineColor}
              strokeWidth={2}
              dot={{ fill: lineColor, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
