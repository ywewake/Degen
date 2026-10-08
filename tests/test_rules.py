"""Milestones 1-3: create an idea, freeze the prediction, count attempts.

Run: python3 -m unittest discover tests
"""

import io
import os
import sqlite3
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from lab import cli, core


class RulesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        os.environ["LOOP_ROOT"] = self.tmp.name

    def tearDown(self):
        for p in self.root.rglob("*"):
            if p.is_file():
                p.chmod(0o644)
        self.tmp.cleanup()
        del os.environ["LOOP_ROOT"]

    def fill(self, hid=1):
        d = self.root / f"research/hypothesis_{hid:03d}"
        (d / "hypothesis.md").write_text("IDEA\n\nSelloffs rebound.\n")
        (d / "prediction.md").write_text("PREDICTION\n\nOutperform over 20 days.\n")
        (d / "strategy.py").write_text("def generate_signals(prices):\n    return []\n")
        return d

    def ready(self):
        core.new_idea("Selloff rebound")
        d = self.fill()
        core.freeze(1)
        return d

    # ---- Milestone 1: one command creates the hypothesis

    def test_new_creates_folder_and_ledger_entry(self):
        h = core.new_idea("Selloff rebound")
        self.assertEqual(h.id, 1)
        for f in ("hypothesis.md", "prediction.md", "strategy.py"):
            self.assertTrue((self.root / "research/hypothesis_001" / f).exists())
        self.assertEqual(core.ideas(), [{"id": 1, "title": "Selloff rebound", "attempts": 0, "result": "DRAFT"}])
        self.assertEqual(core.new_idea("Volume expansion").id, 2)

    def test_new_refuses_stray_folder(self):
        (self.root / "research/hypothesis_001").mkdir(parents=True)
        with self.assertRaisesRegex(core.LoopError, "already exists"):
            core.new_idea("x")
        self.assertEqual(core.ideas(), [])

    def test_cli_ideas_table(self):
        core.new_idea("Selloff rebound")
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(cli.main(["ideas"]), 0)
        self.assertIn("Selloff rebound", out.getvalue())
        self.assertIn("DRAFT", out.getvalue())

    # ---- Milestone 2: predictions are immutable

    def test_cannot_freeze_blank_template(self):
        core.new_idea("x")
        with self.assertRaisesRegex(core.LoopError, "blank template"):
            core.freeze(1)

    def test_freeze_twice_is_refused(self):
        self.ready()
        with self.assertRaisesRegex(core.LoopError, "Prediction 001 is frozen"):
            core.freeze(1)

    def test_frozen_files_are_read_only(self):
        d = self.ready()
        self.assertFalse(os.stat(d / "prediction.md").st_mode & 0o222)
        self.assertFalse(os.stat(d / "hypothesis.md").st_mode & 0o222)

    def test_edited_prediction_is_detected(self):
        d = self.ready()
        p = d / "prediction.md"
        p.chmod(0o644)  # someone forces it
        p.write_text("PREDICTION\n\nWhatever happened.\n")
        with self.assertRaisesRegex(core.LoopError, "TAMPERING DETECTED"):
            core.attempt(1)

    def test_edited_hypothesis_is_detected(self):
        d = self.ready()
        (d / "hypothesis.md").chmod(0o644)
        (d / "hypothesis.md").write_text("IDEA\n\nSomething else.\n")
        with self.assertRaisesRegex(core.LoopError, "TAMPERING DETECTED"):
            core.attempt(1)

    def test_deleted_prediction_is_detected(self):
        d = self.ready()
        (d / "prediction.md").unlink()
        with self.assertRaisesRegex(core.LoopError, "TAMPERING DETECTED"):
            core.attempt(1)

    def test_attempt_requires_frozen_prediction(self):
        core.new_idea("x")
        self.fill()
        with self.assertRaisesRegex(core.LoopError, "not frozen"):
            core.attempt(1)

    def test_revise_costs_an_attempt_and_must_be_frozen(self):
        d = self.ready()
        self.assertEqual(core.revise(1), 1)
        self.assertTrue((d / "prediction_v2.md").exists())
        with self.assertRaisesRegex(core.LoopError, "draft v2 is not frozen"):
            core.attempt(1)
        (d / "prediction_v2.md").write_text("PREDICTION\n\n30 days instead.\n")
        self.assertEqual(core.freeze(1), 2)
        n, snap = core.attempt(1)
        self.assertEqual(n, 2)
        self.assertEqual(snap.name, "h001_v2.py")

    def test_ledger_rejects_sql_edits(self):
        self.ready()
        conn = sqlite3.connect(self.root / "memory/ledger.db")
        for sql in ("UPDATE predictions SET sha256 = 'x'",
                    "DELETE FROM predictions",
                    "UPDATE hypotheses SET title = 'y'"):
            with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                conn.execute(sql)

    # ---- Milestone 3: three attempts, then blocked

    def test_three_attempts_then_blocked(self):
        d = self.ready()
        for n in (1, 2, 3):
            (d / "strategy.py").write_text(f"def generate_signals(prices):\n    return [{n}]\n")
            got, snap = core.attempt(1)
            self.assertEqual(got, n)
            self.assertEqual(snap, self.root / f"strategies/h001_v{n}.py")
            self.assertFalse(os.stat(snap).st_mode & 0o222)
        with self.assertRaisesRegex(core.LoopError, "NO MORE ATTEMPTS"):
            core.attempt(1)
        with self.assertRaisesRegex(core.LoopError, "NO MORE ATTEMPTS"):
            core.revise(1)
        self.assertFalse((self.root / "strategies/h001_v4.py").exists())
        self.assertEqual(core.ideas()[0]["result"], "NO ATTEMPTS LEFT")

    def test_attempt_4_blocked_even_via_raw_sql(self):
        d = self.ready()
        for _ in range(3):
            core.attempt(1)
        conn = sqlite3.connect(self.root / "memory/ledger.db")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO attempts (hypothesis_id, attempt_no, kind, prediction_version) "
                         "VALUES (1, 4, 'prediction_revision', 1)")

    def test_attempt_numbers_cannot_skip(self):
        self.ready()
        conn = sqlite3.connect(self.root / "memory/ledger.db")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "sequential"):
            conn.execute("INSERT INTO attempts (hypothesis_id, attempt_no, kind, prediction_version) "
                         "VALUES (1, 3, 'prediction_revision', 1)")

    def test_edited_strategy_snapshot_is_detected(self):
        self.ready()
        _, snap = core.attempt(1)
        snap.chmod(0o644)
        snap.write_text("def generate_signals(prices):\n    return ['better']\n")
        with self.assertRaisesRegex(core.LoopError, "TAMPERING DETECTED"):
            core.attempt(1)

    def test_blank_strategy_does_not_burn_an_attempt(self):
        core.new_idea("x")
        d = self.fill()
        (d / "strategy.py").write_text(core.STRATEGY_TEMPLATE.format(num=1, title="x"))
        core.freeze(1)
        with self.assertRaisesRegex(core.LoopError, "blank template"):
            core.attempt(1)
        self.assertEqual(core.ideas()[0]["attempts"], 0)

    def test_stray_snapshot_is_not_overwritten_and_no_attempt_used(self):
        self.ready()
        (self.root / "strategies").mkdir()
        (self.root / "strategies/h001_v1.py").write_text("planted")
        with self.assertRaisesRegex(core.LoopError, "Refusing to overwrite"):
            core.attempt(1)
        self.assertEqual((self.root / "strategies/h001_v1.py").read_text(), "planted")
        self.assertEqual(core.ideas()[0]["attempts"], 0)

    def test_cli_reports_errors_without_traceback(self):
        err = io.StringIO()
        with redirect_stderr(err):
            self.assertEqual(cli.main(["attempt", "7"]), 1)
        self.assertIn("No hypothesis 007", err.getvalue())


if __name__ == "__main__":
    unittest.main()
