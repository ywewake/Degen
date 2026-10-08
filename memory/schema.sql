-- Hypothesis ledger. Create with: sqlite3 memory/ledger.db < memory/schema.sql
CREATE TABLE IF NOT EXISTS hypotheses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    title         TEXT NOT NULL,
    statement     TEXT NOT NULL,           -- falsifiable claim
    memo_path     TEXT,                    -- research/<memo>.md
    status        TEXT NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed','backtesting','paper','rejected','retired')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    hypothesis_id  INTEGER NOT NULL REFERENCES hypotheses(id),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    kind           TEXT NOT NULL CHECK (kind IN ('backtest','paper','note')),
    strategy       TEXT,                   -- e.g. strategies/momentum_v1.py
    result_path    TEXT,                   -- backtests/... or journal/...
    verdict        TEXT CHECK (verdict IN ('supports','refutes','inconclusive')),
    summary        TEXT
);
