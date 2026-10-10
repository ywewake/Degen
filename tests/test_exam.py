"""Milestone 5: exam log, sandbox, preflight and the judge.

Run: python3 -m unittest discover tests
"""

import json
import os
import random
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from helpers import git, make_repo_with_protected_origin
from lab import backtest, core, examlog, sandbox, sealed

KEY = "correct horse battery staple"
HAS_BWRAP = shutil.which("bwrap") is not None

PICK_WIN = """
def generate_signals(prices):
    today = max(v[-1][0] for v in prices.values())
    if "WIN.V" in prices and prices["WIN.V"][-1][0] == today:
        return {"WIN.V": 1.0}
    return {}
"""

FIRST_LIVE = """
def generate_signals(prices):
    today = max(v[-1][0] for v in prices.values())
    live = sorted(t for t, v in prices.items() if v[-1][0] == today)
    return {live[0]: WEIGHT}
"""


def exam_csv(days=120, seed=1) -> bytes:
    rng = random.Random(seed)
    px = {"WIN.V": 1.0, "AAA.V": 1.0, "BBB.V": 1.0, "CCC.TO": 1.0}
    lines = ["date,ticker,close,volume"]
    for i in range(days):
        for t in px:
            drift = 0.01 if t == "WIN.V" else 0.0
            px[t] *= 1 + drift + rng.gauss(0, 0.01)
            lines.append(f"2023-{1 + i // 28:02d}-{1 + i % 28:02d},{t},{px[t]:.6f},1000")
    return ("\n".join(lines) + "\n").encode()


@unittest.skipUnless(HAS_BWRAP, "bubblewrap not installed")
class ExamTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "repo"
        self.root.mkdir()
        os.environ["LOOP_ROOT"] = str(self.root)
        self.remote = make_repo_with_protected_origin(self.root)
        examlog.init()
        plain = self.root / "exam.csv"
        plain.write_bytes(exam_csv())
        sealed.seal(plain, KEY)
        plain.unlink()

    def tearDown(self):
        for p in Path(self.tmp.name).rglob("*"):
            if p.is_file():
                p.chmod(0o644)
        self.tmp.cleanup()
        del os.environ["LOOP_ROOT"]

    def hypothesis(self, strategy_src=PICK_WIN, idea="Winners keep winning"):
        h = core.new_idea(idea)
        (h.dir / "hypothesis.md").write_text(f"IDEA\n\n{idea}\n")
        (h.dir / "prediction.md").write_text(f"PREDICTION\n\n{idea} beats the benchmark.\n")
        (h.dir / "strategy.py").write_text(strategy_src)
        core.freeze(h.id)
        core.attempt(h.id)
        return h

    def wipe_local(self):
        """The attack: delete the local ledger and every hypothesis/strategy file."""
        (self.root / "memory/ledger.db").unlink()
        (self.root / "memory/judge.db").unlink()  # single-user mode: the AI can reach it
        for d in ("research", "strategies"):
            for p in (self.root / d).rglob("*"):
                p.chmod(0o755 if p.is_dir() else 0o644)
            shutil.rmtree(self.root / d)

    def n_exams(self):
        return len(examlog.exams(examlog.fetch()[1]))

    def local_exams(self):
        return sealed.connect().execute("SELECT COUNT(*) FROM sealed_evaluations").fetchone()[0]

    # ---- the judge

    def test_real_edge_passes(self):
        h = self.hypothesis()
        r = sealed.evaluate(h.id, KEY)
        self.assertEqual(r["result"], "PASS", r)
        self.assertGreater(r["t_stat"], 3.0)
        self.assertEqual(r["n_tested"], 1)
        self.assertEqual(r["required_t_stat"], 3.0)

    def test_no_edge_fails(self):
        h = self.hypothesis("def generate_signals(prices):\n"
                            "    today = max(v[-1][0] for v in prices.values())\n"
                            "    live = sorted(t for t, v in prices.items() if v[-1][0] == today)\n"
                            "    return {live[0]: 1.0} if live and live[0] != 'WIN.V' else {}\n")
        r = sealed.evaluate(h.id, KEY)
        self.assertEqual((r["result"], r["category"]), ("FAIL", "HYPOTHESIS_FAILED"))

    def test_result_is_in_exam_log(self):
        h = self.hypothesis()
        sealed.evaluate(h.id, KEY)
        records = examlog.fetch()[1]
        self.assertEqual([r["type"] for r in records], ["exam", "result"])
        self.assertEqual(records[1]["result"]["result"], "PASS")

    # ---- the sandbox: the strategy cannot leak the exam

    def test_strategy_cannot_write_sealed_data_to_disk(self):
        leak = self.root / "data" / "development" / "leak.csv"
        leak.parent.mkdir(parents=True)
        h = self.hypothesis(PICK_WIN.replace("def generate_signals(prices):",
                                             "def generate_signals(prices):\n"
                                             "    for p in (%r, '/tmp/leak', '/sandbox/leak'):\n"
                                             "        try:\n"
                                             "            open(p, 'a').write(repr(prices))\n"
                                             "        except OSError:\n"
                                             "            pass" % str(leak)))
        r = sealed.evaluate(h.id, KEY)
        self.assertEqual(r["result"], "PASS")  # it ran normally...
        self.assertFalse(leak.exists())        # ...and wrote nothing anywhere we can see

    def test_strategy_has_no_network(self):
        server = socket.socket()
        server.bind(("127.0.0.1", 0))
        server.listen()
        server.settimeout(0.5)
        port = server.getsockname()[1]
        connected = []
        stop = threading.Event()

        def accept():
            while not stop.is_set():
                try:
                    connected.append(server.accept())
                except OSError:
                    pass
        threading.Thread(target=accept, daemon=True).start()
        h = self.hypothesis(PICK_WIN.replace("def generate_signals(prices):",
                                             "import socket\n\ndef generate_signals(prices):\n"
                                             "    try:\n"
                                             "        socket.create_connection(('127.0.0.1', %d), timeout=0.2)"
                                             ".sendall(repr(prices).encode())\n"
                                             "    except OSError:\n"
                                             "        pass" % port))
        sealed.evaluate(h.id, KEY)
        stop.set()
        server.close()
        self.assertEqual(connected, [])

    def test_crash_on_sealed_data_does_not_leak_its_message(self):
        h = self.hypothesis("def generate_signals(prices):\n"
                            "    if 'WIN.V' in prices:\n"
                            "        raise RuntimeError('LEAK ' + repr(prices['WIN.V'][:3]))\n"
                            "    return {}\n")
        r = sealed.evaluate(h.id, KEY)
        self.assertEqual((r["result"], r["category"], r["detail"]), ("FAIL", "IMPLEMENTATION_FAILED", "crashed"))
        log = subprocess.run(["git", "-C", str(self.remote), "log", "-p", "exam-log"],
                             capture_output=True, text=True).stdout
        self.assertNotIn("LEAK", json.dumps(r) + log)
        self.assertNotIn("2023-01-01", json.dumps(r) + log)

    def test_strategy_cannot_look_ahead(self):
        # Each day the strategy reports how many dates it can see, as a weight.
        src = Path(self.tmp.name) / "s.py"
        src.write_text("def generate_signals(prices):\n"
                       "    n = len({d for v in prices.values() for d, _, _ in v})\n"
                       "    return {'A': n / 1000}\n")
        days = [(f"2024-01-{i + 1:02d}", [["A", 1.0, 1.0]]) for i in range(20)]
        weights = sandbox.run(src, days, timeout=30)
        self.assertEqual([w["A"] for w in weights], [(i + 1) / 1000 for i in range(20)])

    def test_hung_strategy_is_killed(self):
        src = Path(self.tmp.name) / "s.py"
        src.write_text("def generate_signals(prices):\n    while True:\n        pass\n")
        with self.assertRaisesRegex(sandbox.StrategyFailed, "timed out"):
            sandbox.run(src, [("2024-01-01", [["A", 1.0, 1.0]])], timeout=2)

    def test_no_sandbox_no_run(self):
        with mock.patch("shutil.which", return_value=None):
            with self.assertRaisesRegex(core.LoopError, "never runs unsandboxed"):
                sandbox.run(Path(__file__), [("2024-01-01", [])])

    # ---- preflight: a typo costs nothing

    def test_preflight_failure_uses_nothing(self):
        for src, why in (("def generate_signals(prices):\n    return {'X': 1.0}\n", "no price today"),
                         ("def generate_signals(prices):\n    return 1/0\n", "ZeroDivisionError"),
                         (FIRST_LIVE.replace("WEIGHT", "2.0"), "more than 1"),
                         (FIRST_LIVE.replace("WEIGHT", "-1.0"), "negative")):
            h = self.hypothesis(src, idea=f"idea {why}")
            with self.assertRaisesRegex(core.LoopError, f"IMPLEMENTATION FAILED in preflight(.|\\n)*{why}"):
                sealed.evaluate(h.id, KEY)
        self.assertEqual(self.n_exams(), 0)
        self.assertEqual(self.local_exams(), 0)

    def test_preflight_catches_empty_universe_crash(self):
        # Works on normal data but crashes when a stock disappears.
        h = self.hypothesis("def generate_signals(prices):\n"
                            "    today = max(v[-1][0] for v in prices.values())\n"
                            "    assert all(v[-1][0] == today for v in prices.values())\n"
                            "    return {}\n")
        with self.assertRaisesRegex(core.LoopError, "stock disappears"):
            sealed.evaluate(h.id, KEY)

    # ---- exam log: no retakes, N only grows

    def test_retake_after_wiping_ledger_and_folders_is_refused(self):
        h = self.hypothesis()
        sealed.evaluate(h.id, KEY)
        self.wipe_local()
        h = self.hypothesis()  # same files, fresh ledger, "hypothesis 001" again
        with self.assertRaisesRegex(core.LoopError, "RETAKE REFUSED"):
            sealed.evaluate(h.id, KEY)
        self.assertEqual(self.n_exams(), 1)

    def test_retake_with_only_strategy_changed_is_refused(self):
        h = self.hypothesis()
        sealed.evaluate(h.id, KEY)
        self.wipe_local()
        h = self.hypothesis(PICK_WIN + "\n# tweaked\n")
        with self.assertRaisesRegex(core.LoopError, "RETAKE REFUSED. This prediction"):
            sealed.evaluate(h.id, KEY)

    def test_n_comes_from_exam_log_and_survives_ledger_wipe(self):
        sealed.evaluate(self.hypothesis(PICK_WIN + "# one\n", idea="one").id, KEY)
        sealed.evaluate(self.hypothesis(PICK_WIN + "# two\n", idea="two").id, KEY)
        self.wipe_local()
        r = sealed.evaluate(self.hypothesis(PICK_WIN + "# three\n", idea="three").id, KEY)
        self.assertEqual(r["n_tested"], 3)

    def test_missing_exam_log_blocks_exam(self):
        git(self.root, "remote", "set-url", "origin", str(Path(self.tmp.name) / "nowhere.git"))
        h = self.hypothesis()
        with self.assertRaisesRegex(core.LoopError, "Cannot read the exam log"):
            sealed.evaluate(h.id, KEY)
        self.assertEqual(self.local_exams(), 0)

    def test_failed_push_blocks_exam_before_strategy_runs(self):
        hook = self.remote / "hooks" / "pre-receive"
        hook.write_text("#!/bin/sh\nexit 1\n")
        hook.chmod(0o755)
        h = self.hypothesis()
        calls = []
        with self.assertRaisesRegex(core.LoopError, "Could not push"):
            sealed.evaluate(h.id, KEY, scorer=lambda *a, **k: calls.append(1))
        self.assertEqual((calls, self.local_exams()), ([], 0))

    def test_protected_branch_cannot_be_deleted_or_rewound(self):
        sealed.evaluate(self.hypothesis().id, KEY)
        for refspec in (":refs/heads/exam-log", "+refs/exam-log/last-seen~1:refs/heads/exam-log"):
            r = subprocess.run(["git", "-C", str(self.root), "push", "origin", refspec], capture_output=True)
            self.assertNotEqual(r.returncode, 0, refspec)

    def test_rewritten_log_is_detected(self):
        sealed.evaluate(self.hypothesis().id, KEY)
        git(self.remote, "config", "receive.denyNonFastForwards", "false")  # protection misconfigured
        git(self.root, "push", "-q", "-f", "origin", "refs/exam-log/last-seen~2:refs/heads/exam-log")
        with self.assertRaisesRegex(core.LoopError, "EXAM LOG WAS REWRITTEN"):
            examlog.fetch()

    def test_fresh_empty_exam_log_is_refused(self):
        sealed.evaluate(self.hypothesis().id, KEY)
        other = Path(self.tmp.name) / "other.git"
        git(Path(self.tmp.name), "init", "-q", "--bare", str(other))
        git(self.root, "remote", "set-url", "origin", str(other))
        git(self.root, "update-ref", "-d", "refs/exam-log/last-seen")
        examlog.init()
        self.wipe_local()
        h = self.hypothesis()
        with self.assertRaisesRegex(core.LoopError, "WRONG EXAM LOG"):
            sealed.evaluate(h.id, KEY)

    def test_exam_log_identity_in_sealed_file_cannot_be_swapped(self):
        p = sealed.exam_path()
        p.chmod(0o644)
        blob = bytearray(p.read_bytes())
        i = len(sealed.MAGIC) + 1
        blob[i] = ord("0") if blob[i] != ord("0") else ord("1")  # alter the bound genesis
        p.write_bytes(bytes(blob))
        with self.assertRaisesRegex(core.LoopError, "altered"):
            sealed.unseal(KEY)

    def test_sealing_requires_an_exam_log(self):
        git(self.root, "remote", "set-url", "origin", str(Path(self.tmp.name) / "nowhere.git"))
        sealed.exam_path().chmod(0o644)
        sealed.exam_path().unlink()
        plain = self.root / "exam.csv"
        plain.write_bytes(exam_csv())
        with self.assertRaisesRegex(core.LoopError, "Cannot read the exam log"):
            sealed.seal(plain, KEY)

    def test_exam_log_is_never_recreated(self):
        with self.assertRaisesRegex(core.LoopError, "never re-created"):
            examlog.init()


class JudgeTest(unittest.TestCase):
    def test_threshold(self):
        self.assertEqual(backtest.threshold(1), 3.0)
        self.assertEqual(backtest.threshold(90), 3.0)
        self.assertAlmostEqual(backtest.threshold(1000), (2 * __import__("math").log(1000)) ** 0.5)

    def test_parse_cleans_and_rejects(self):
        days = backtest.parse(b"date,ticker,close,volume\n"
                              b"2024-01-03,A,2,1\n2024-01-02,A,1,\n2024-01-02,B,0,5\n"
                              b"bad,A,1,1\n2024-01-04,A,,1\n2024-01-04,B,3,-7\n")
        self.assertEqual(days, [("2024-01-02", [["A", 1.0, 0.0]]), ("2024-01-03", [["A", 2.0, 1.0]]),
                                ("2024-01-04", [["B", 3.0, 0.0]])])
        for bad in (b"date,ticker,close,volume\n2024-01-02,A,1,1\n2024-01-02,A,1,1\n2024-01-03,A,1,1\n",
                    b"date,ticker,close,volume\n2024-01-02,A,1,1\n", b"a,b\n1,2\n", b"\xff\xfe"):
            with self.assertRaises(backtest.DataFailed):
                backtest.parse(bad)

    def test_score_gaps_delisting_and_costs(self):
        days = [("d1", [["A", 10, 1], ["B", 10, 1]]), ("d2", [["A", 11, 1], ["B", 10, 1]]),
                ("d3", [["A", 11, 1]]), ("d4", [["A", 11, 1], ["B", 5, 1]])]
        s = backtest.score(days, [{"A": 1}, {"B": 1}, {}, {}])
        # +10% - 0.5% cost; B marked at its next close (-50%) - 1% cost; exit cost 0.5%
        self.assertAlmostEqual(s["net_return"], 1.095 * 0.49 * 0.995 - 1)
        self.assertEqual(s["trades"], 2)
        s = backtest.score(days[:3], [{"B": 1}, {"B": 1}, {}])
        self.assertAlmostEqual(s["net_return"], -1.0)  # B never trades again


if __name__ == "__main__":
    unittest.main()
