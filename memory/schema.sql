-- Hypothesis ledger: the machine's notebook.
-- Applied automatically by ./loop on first use (memory/ledger.db).
--
-- The rules live here as well as in the CLI, so they hold even if someone
-- bypasses ./loop and writes SQL by hand:
--   * history is append-only (no UPDATE / DELETE on any table)
--   * a hypothesis gets at most 3 attempts, numbered 1, 2, 3 with no gaps

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hypotheses (
    id          INTEGER PRIMARY KEY,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    title       TEXT NOT NULL,
    dir         TEXT NOT NULL UNIQUE          -- research/hypothesis_001
);

-- One row per frozen version of the hypothesis + prediction.
-- Version 1 is prediction.md; version k > 1 is prediction_v<k>.md.
CREATE TABLE IF NOT EXISTS predictions (
    id                 INTEGER PRIMARY KEY,
    hypothesis_id      INTEGER NOT NULL REFERENCES hypotheses(id),
    version            INTEGER NOT NULL CHECK (version >= 1),
    frozen_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    path               TEXT NOT NULL,
    sha256             TEXT NOT NULL,
    hypothesis_sha256  TEXT NOT NULL,         -- hypothesis.md is frozen with it
    UNIQUE (hypothesis_id, version)
);

-- Every attempt, including a prediction revision (which costs a life).
CREATE TABLE IF NOT EXISTS attempts (
    id                  INTEGER PRIMARY KEY,
    hypothesis_id       INTEGER NOT NULL REFERENCES hypotheses(id),
    attempt_no          INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 3),
    kind                TEXT NOT NULL CHECK (kind IN ('test', 'prediction_revision')),
    prediction_version  INTEGER NOT NULL,
    strategy_path       TEXT,                 -- strategies/h001_v<attempt_no>.py
    strategy_sha256     TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (hypothesis_id, attempt_no),
    CHECK ((kind = 'test') = (strategy_path IS NOT NULL AND strategy_sha256 IS NOT NULL))
);

CREATE TRIGGER IF NOT EXISTS attempts_sequential
BEFORE INSERT ON attempts
WHEN NEW.attempt_no != (SELECT COUNT(*) + 1 FROM attempts WHERE hypothesis_id = NEW.hypothesis_id)
BEGIN
    SELECT RAISE(ABORT, 'attempt numbers must be sequential');
END;

CREATE TRIGGER IF NOT EXISTS hypotheses_no_update BEFORE UPDATE ON hypotheses
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS hypotheses_no_delete BEFORE DELETE ON hypotheses
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS predictions_no_update BEFORE UPDATE ON predictions
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS predictions_no_delete BEFORE DELETE ON predictions
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS attempts_no_update BEFORE UPDATE ON attempts
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS attempts_no_delete BEFORE DELETE ON attempts
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
