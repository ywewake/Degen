"""Milestone 4: the sealed-data boundary, plus the IBKR paper-only guard.

Run: python3 -m unittest discover tests
"""

import ast
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from helpers import make_repo_with_protected_origin
from lab import broker, core, devdata, examlog, sealed

KEY = "correct horse battery staple"
EXAM = b"date,ticker,close,volume\n2024-01-02,FAKE.V,1.23,100\n2024-01-03,FAKE.V,1.31,200\n"


def counting_scorer(calls):
    def scorer(data, strategy_path, n_tested):
        calls.append((data, strategy_path))
        return {"rows": data.count(b"\n") - 1}
    return scorer


class SealedTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "repo"
        self.root.mkdir()
        os.environ["LOOP_ROOT"] = str(self.root)
        make_repo_with_protected_origin(self.root)
        examlog.init()
        plain = self.root / "exam.csv"
        plain.write_bytes(EXAM)
        sealed.seal(plain, KEY)
        plain.unlink()

    def tearDown(self):
        for p in self.root.rglob("*"):
            if p.is_file():
                p.chmod(0o644)
        self.tmp.cleanup()
        del os.environ["LOOP_ROOT"]

    def hypothesis_with_attempt(self):
        h = core.new_idea("Boring idea")
        d = h.dir
        (d / "hypothesis.md").write_text("IDEA\n\nx\n")
        (d / "prediction.md").write_text("PREDICTION\n\ny\n")
        (d / "strategy.py").write_text("def generate_signals(prices):\n    return {}\n")
        core.freeze(h.id)
        core.attempt(h.id)
        return h

    def evaluations(self):
        return sealed.connect().execute("SELECT COUNT(*) FROM sealed_evaluations").fetchone()[0]

    # ---- development cannot read it

    def test_sealed_file_is_ciphertext(self):
        blob = sealed.exam_path().read_bytes()
        self.assertNotIn(b"FAKE.V", blob)
        self.assertNotIn(b"close", blob)

    def test_dev_loader_refuses_sealed_paths(self):
        for name in ("../sealed/exam.sealed", str(sealed.exam_path()), "x.sealed", "../../memory/ledger.db"):
            with self.assertRaisesRegex(core.LoopError, "outside data/development"):
                devdata.dev_path(name)
        (self.root / "data/development").mkdir()
        (self.root / "data/development/prices.csv").write_bytes(b"ok")
        self.assertEqual(devdata.read("prices.csv"), b"ok")

    def test_key_is_not_on_disk(self):
        for p in self.root.rglob("*"):
            if p.is_file():
                self.assertNotIn(KEY.encode(), p.read_bytes(), p)

    def test_sealed_code_never_reads_key_from_environment(self):
        for f in (Path(sealed.__file__), Path(sealed.__file__).with_name("sealed_cli.py")):
            for node in ast.walk(ast.parse(f.read_text())):
                name = getattr(node, "attr", None) or getattr(node, "id", None) or getattr(node, "module", None)
                self.assertNotIn(name, ("environ", "getenv", "environb", "dotenv"), f)
                if isinstance(node, ast.Import):
                    self.assertNotIn("dotenv", [a.name for a in node.names], f)

    # ---- evaluator can read it, with the right key

    def test_evaluator_reads_with_right_key(self):
        self.assertEqual(sealed.unseal(KEY), EXAM)

    def test_wrong_key_fails_and_does_not_use_up_the_exam(self):
        h = self.hypothesis_with_attempt()
        calls = []
        with self.assertRaisesRegex(core.LoopError, "Wrong key"):
            sealed.evaluate(h.id, "wrong key wrong key", counting_scorer(calls))
        self.assertEqual(calls, [])
        self.assertEqual(self.evaluations(), 0)

    def test_missing_key_fails(self):
        with self.assertRaisesRegex(core.LoopError, "No key"):
            sealed.unseal("")
        with mock.patch("os.open", side_effect=OSError):
            with self.assertRaisesRegex(core.LoopError, "typed by a human at a terminal"):
                sealed.ask_passphrase()

    def test_altered_exam_fails(self):
        p = sealed.exam_path()
        p.chmod(0o644)
        blob = bytearray(p.read_bytes())
        blob[-1] ^= 1
        p.write_bytes(bytes(blob))
        with self.assertRaisesRegex(core.LoopError, "Wrong key, or the sealed file was altered"):
            sealed.unseal(KEY)

    def test_development_data_is_not_a_sealed_exam(self):
        p = sealed.exam_path()
        p.chmod(0o644)
        p.write_bytes(EXAM)  # someone points the "exam" at plain development data
        with self.assertRaisesRegex(core.LoopError, "not a sealed exam file"):
            sealed.unseal(KEY)

    # ---- evaluation works once, then never again

    def test_evaluation_works_then_second_is_blocked(self):
        h = self.hypothesis_with_attempt()
        calls = []
        self.assertEqual(sealed.evaluate(h.id, KEY, counting_scorer(calls)), {"rows": 2})
        self.assertEqual(calls, [(EXAM, self.root / "strategies/h001_v1.py")])
        with self.assertRaisesRegex(core.LoopError, "already taken the sealed exam"):
            sealed.evaluate(h.id, KEY, counting_scorer(calls))
        self.assertEqual(len(calls), 1)

    def test_exam_is_recorded_before_strategy_sees_data(self):
        h = self.hypothesis_with_attempt()

        def crashing_scorer(data, path, n_tested):
            raise RuntimeError("crash mid-exam")
        with self.assertRaises(RuntimeError):
            sealed.evaluate(h.id, KEY, crashing_scorer)
        with self.assertRaisesRegex(core.LoopError, "already taken"):
            sealed.evaluate(h.id, KEY, counting_scorer([]))

    def test_second_exam_blocked_even_via_raw_sql(self):
        h = self.hypothesis_with_attempt()
        sealed.evaluate(h.id, KEY, counting_scorer([]))
        conn = sqlite3.connect(self.root / "memory/ledger.db")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("DELETE FROM sealed_evaluations")
        with self.assertRaises(sqlite3.IntegrityError):
            conn.execute("INSERT INTO sealed_evaluations (hypothesis_id, attempt_no, strategy_sha256, exam_sha256) "
                         "VALUES (1, 1, 'x', 'y')")

    def test_no_attempts_after_exam(self):
        h = self.hypothesis_with_attempt()
        sealed.evaluate(h.id, KEY, counting_scorer([]))
        (h.dir / "strategy.py").write_text("def generate_signals(prices):\n    return ['tweak']\n")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "sealed exam"):
            core.attempt(h.id)

    def test_exam_requires_a_strategy_attempt(self):
        h = core.new_idea("x")
        with self.assertRaisesRegex(core.LoopError, "no final strategy attempt"):
            sealed.evaluate(h.id, KEY, counting_scorer([]))

    def test_tampered_strategy_snapshot_blocks_exam(self):
        h = self.hypothesis_with_attempt()
        snap = self.root / "strategies/h001_v1.py"
        snap.chmod(0o644)
        snap.write_text("def generate_signals(prices):\n    return ['peeked']\n")
        with self.assertRaisesRegex(core.LoopError, "TAMPERING DETECTED"):
            sealed.evaluate(h.id, KEY, counting_scorer([]))

    # ---- sealing rules

    def test_cannot_replace_the_exam(self):
        other = self.root / "other.csv"
        other.write_bytes(b"easier exam")
        with self.assertRaisesRegex(core.LoopError, "refusing to replace"):
            sealed.seal(other, KEY)

    def test_short_key_refused(self):
        sealed.exam_path().chmod(0o644)
        sealed.exam_path().unlink()
        with self.assertRaisesRegex(core.LoopError, "at least"):
            sealed.seal(Path(__file__), "short")


class BrokerGuardTest(unittest.TestCase):
    def test_live_ports_refused(self):
        for port in (7496, 4001):
            with self.assertRaisesRegex(core.LoopError, "LIVE"):
                broker.assert_paper(port, "DU123")

    def test_non_paper_account_refused(self):
        with self.assertRaisesRegex(core.LoopError, "not a paper account"):
            broker.assert_paper(7497, "U123")

    def test_broker_is_a_stub(self):
        with self.assertRaises(NotImplementedError):
            broker.PaperBroker("127.0.0.1", 7497, 1, "DU123")


if __name__ == "__main__":
    unittest.main()
