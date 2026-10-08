# AI-assisted trading research loop (paper only)

**Paper trading only. Never connect a live-money account.**

| Dir | Purpose | Tracked in git |
|---|---|---|
| `research/` | Idea memos (`YYYY-MM-DD-slug.md`) | yes |
| `strategies/` | One file per strategy, versioned: `<name>_v<N>.py` | yes |
| `backtests/` | Backtest results | yes |
| `journal/` | Every paper-trading decision and its reasoning | yes |
| `memory/` | Hypothesis ledger (SQLite; `schema.sql` tracked, `*.db` ignored) | schema only |
| `config/` | `.env` (Alpaca paper keys), `risk_limits.yaml` | templates only |
| `data/` | Historical prices | no |

## Setup
```
pip install -r requirements.txt
# edit config/.env with your PAPER keys (never commit, never print)
cp config/risk_limits.yaml.example config/risk_limits.yaml
sqlite3 memory/ledger.db < memory/schema.sql
```
