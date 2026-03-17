// CryptoAlpha — Export Trade History (SIGNALS Plan Feature)
// Exports paper trading history as a CSV file for external analysis.

import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { PaperPortfolio } from '@/services/paperTrading';

interface Props {
  portfolio: PaperPortfolio;
}

function formatDate(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19);
}

export function ExportHistory({ portfolio }: Props) {
  const closedTrades = portfolio.trades.filter(t => t.status === 'CLOSED' || t.status === 'STOPPED_OUT');

  const exportCSV = () => {
    if (closedTrades.length === 0) {
      toast.error('No closed trades to export');
      return;
    }

    const headers = [
      'Trade #', 'Symbol', 'Direction', 'Timeframe',
      'Entry Price', 'Exit Price', 'Stop Loss', 'TP1', 'TP2', 'TP3',
      'Quantity ($)', 'Dollar Risked', 'P&L ($)', 'P&L (%)',
      'Status', 'Opened At', 'Closed At', 'Notes',
    ];

    const rows = closedTrades.map((t, i) => [
      i + 1,
      t.ticker,
      t.direction,
      t.timeframe,
      t.entryPrice.toFixed(8),
      (t.exitPrice ?? '').toString(),
      t.stopLoss.toFixed(8),
      t.tp1.toFixed(8),
      t.tp2.toFixed(8),
      t.tp3.toFixed(8),
      t.dollarInvested.toFixed(2),
      t.dollarRisked.toFixed(2),
      (t.pnlDollar ?? 0).toFixed(2),
      (t.pnlPct ?? 0).toFixed(4),
      t.status,
      formatDate(t.openedAt),
      formatDate(t.closedAt),
      `"${(t.notes ?? '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      '',
      `Starting Balance,${portfolio.startingBalance}`,
      `Current Balance,${portfolio.balance.toFixed(2)}`,
      `Total P&L,${(portfolio.balance - portfolio.startingBalance).toFixed(2)}`,
      `Win Rate,${portfolio.winRate.toFixed(1)}%`,
      `Total Trades,${portfolio.totalTrades}`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cryptoalpha-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${closedTrades.length} trades as CSV`);
  };

  const exportJSON = () => {
    if (closedTrades.length === 0) {
      toast.error('No closed trades to export');
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      portfolio: {
        startingBalance: portfolio.startingBalance,
        currentBalance: portfolio.balance,
        totalPnl: portfolio.balance - portfolio.startingBalance,
        winRate: portfolio.winRate,
        totalTrades: portfolio.totalTrades,
      },
      trades: closedTrades,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cryptoalpha-trades-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${closedTrades.length} trades as JSON`);
  };

  return (
    <div className="data-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-[oklch(0.78_0.18_75)]" />
        <span className="text-sm font-semibold text-foreground">Export Trade History</span>
        <span className="text-[9px] font-mono bg-[oklch(0.78_0.18_75)]/15 text-[oklch(0.78_0.18_75)] border border-[oklch(0.78_0.18_75)]/30 rounded-full px-1.5 py-0.5 ml-auto">
          SIGNALS
        </span>
      </div>

      <div className="bg-secondary/30 rounded p-2.5 mb-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs font-mono font-bold text-foreground">{closedTrades.length}</div>
            <div className="text-[9px] text-muted-foreground">Closed Trades</div>
          </div>
          <div>
            <div className="text-xs font-mono font-bold text-foreground">{portfolio.winRate.toFixed(0)}%</div>
            <div className="text-[9px] text-muted-foreground">Win Rate</div>
          </div>
          <div>
            <div className={`text-xs font-mono font-bold ${portfolio.balance >= portfolio.startingBalance ? 'text-[oklch(0.75_0.22_145)]' : 'text-[oklch(0.65_0.22_27)]'}`}>
              {portfolio.balance >= portfolio.startingBalance ? '+' : ''}${(portfolio.balance - portfolio.startingBalance).toFixed(2)}
            </div>
            <div className="text-[9px] text-muted-foreground">Total P&L</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={exportCSV}
          disabled={closedTrades.length === 0}
          aria-label="Export trade history as CSV"
          className="flex items-center justify-center gap-1.5 py-2 rounded border border-[oklch(0.78_0.18_75)]/40 bg-[oklch(0.78_0.18_75)]/10 text-[oklch(0.78_0.18_75)] text-[10px] font-mono font-bold hover:opacity-80 transition-opacity disabled:opacity-40 active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
        <button
          onClick={exportJSON}
          disabled={closedTrades.length === 0}
          aria-label="Export trade history as JSON"
          className="flex items-center justify-center gap-1.5 py-2 rounded border border-border bg-secondary/30 text-muted-foreground text-[10px] font-mono font-bold hover:text-foreground hover:bg-secondary/50 transition-all disabled:opacity-40 active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          Export JSON
        </button>
      </div>

      {closedTrades.length === 0 && (
        <p className="text-[9px] text-muted-foreground/60 font-mono text-center mt-2">
          Close some paper trades first to export them
        </p>
      )}
    </div>
  );
}
