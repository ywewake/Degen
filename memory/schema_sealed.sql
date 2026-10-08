-- Sealed exam ledger (Milestone 4). Applied on top of schema.sql.
-- Same rules: append-only, enforced by SQLite, not just by ./evaluate_sealed.

-- One row per hypothesis, ever. Written BEFORE the strategy sees sealed data,
-- so a crash mid-exam still counts as having taken it.
CREATE TABLE IF NOT EXISTS sealed_evaluations (
    id               INTEGER PRIMARY KEY,
    hypothesis_id    INTEGER NOT NULL UNIQUE REFERENCES hypotheses(id),
    attempt_no       INTEGER NOT NULL,
    strategy_sha256  TEXT NOT NULL,
    exam_sha256      TEXT NOT NULL,       -- which encrypted exam file was used
    started_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sealed_results (
    evaluation_id  INTEGER PRIMARY KEY REFERENCES sealed_evaluations(id),
    recorded_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    result_json    TEXT NOT NULL
);

-- After the exam, the hypothesis is closed: no new attempts, no new predictions.
CREATE TRIGGER IF NOT EXISTS attempts_closed_after_exam BEFORE INSERT ON attempts
WHEN EXISTS (SELECT 1 FROM sealed_evaluations WHERE hypothesis_id = NEW.hypothesis_id)
BEGIN SELECT RAISE(ABORT, 'hypothesis has taken the sealed exam; it is closed'); END;
CREATE TRIGGER IF NOT EXISTS predictions_closed_after_exam BEFORE INSERT ON predictions
WHEN EXISTS (SELECT 1 FROM sealed_evaluations WHERE hypothesis_id = NEW.hypothesis_id)
BEGIN SELECT RAISE(ABORT, 'hypothesis has taken the sealed exam; it is closed'); END;

CREATE TRIGGER IF NOT EXISTS sealed_evaluations_no_update BEFORE UPDATE ON sealed_evaluations
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS sealed_evaluations_no_delete BEFORE DELETE ON sealed_evaluations
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS sealed_results_no_update BEFORE UPDATE ON sealed_results
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS sealed_results_no_delete BEFORE DELETE ON sealed_results
BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
