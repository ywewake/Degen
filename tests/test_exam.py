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
from datetime import datetime
import unittest
from pathlib import Path
from unittest import mock

from helpers import git, make_repo_with_protected_origin
from lab import backtest, core, examlog, sandbox, sealed

KEY = "correct horse battery staple"
TERMS = "Cost round trip: 2%\nMinimum trades: 1\nNewey-West lag: 5\n"
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
    lines = ["date,ticker,open,close,volume"]
    for i in range(days):
        for t in px:
            drift = 0.01 if t == "WIN.V" else 0.0
            op = px[t] * (1 + drift / 2 + rng.gauss(0, 0.005))
            px[t] = op * (1 + drift / 2 + rng.gauss(0, 0.005))
            lines.append(f"2027-{1 + i // 28:02d}-{1 + i % 28:02d},{t},{op:.6f},{px[t]:.6f},1000")
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
        (h.dir / "prediction.md").write_text(f"PREDICTION\n\n{idea} beats the benchmark.\n\n{TERMS}")
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
        self.assertEqual([r["type"] for r in records], ["exam_file", "exam", "result"])
        self.assertEqual(records[2]["result"]["result"], "PASS")

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
        self.assertNotIn("('2027-01-01'", json.dumps(r) + log)  # the repr of the leaked price rows

    def test_strategy_cannot_look_ahead(self):
        # Each day the strategy reports how many dates it can see, as a weight.
        src = Path(self.tmp.name) / "s.py"
        src.write_text("def generate_signals(prices):\n"
                       "    n = len({d for v in prices.values() for d, _, _, _ in v})\n"
                       "    return {'A': n / 1000}\n")
        days = [(f"2024-01-{i + 1:02d}", [["A", 1.0, 1.0, 1.0]]) for i in range(20)]
        weights = sandbox.run(src, days, timeout=30)
        self.assertEqual([w["A"] for w in weights], [(i + 1) / 1000 for i in range(20)])

    def test_hung_strategy_is_killed(self):
        src = Path(self.tmp.name) / "s.py"
        src.write_text("def generate_signals(prices):\n    while True:\n        pass\n")
        with self.assertRaisesRegex(sandbox.StrategyFailed, "timed out"):
            sandbox.run(src, [("2024-01-01", [["A", 1.0, 1.0, 1.0]])], timeout=2)

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

    def at(self, iso):
        """Pretend the exam happens at `iso` (UTC)."""
        return mock.patch.object(examlog, "now", return_value=datetime.fromisoformat(iso + "+00:00"))

    def test_n_comes_from_exam_log_and_survives_ledger_wipe(self):
        with self.at("2026-10-12T18:00:00"):
            sealed.evaluate(self.hypothesis(PICK_WIN + "# one\n", idea="one").id, KEY)
        with self.at("2026-10-19T18:00:00"):
            sealed.evaluate(self.hypothesis(PICK_WIN + "# two\n", idea="two").id, KEY)
        self.wipe_local()
        with self.at("2026-10-26T18:00:00"):
            r = sealed.evaluate(self.hypothesis(PICK_WIN + "# three\n", idea="three").id, KEY)
        self.assertEqual(r["n_tested"], 3)

    def test_one_exam_per_week(self):
        # Monday 2026-10-12 00:30 Vancouver is 07:30 UTC; Sunday 2026-10-18 23:30 Vancouver is 06:30 UTC Monday.
        with self.at("2026-10-12T07:30:00"):
            sealed.evaluate(self.hypothesis(PICK_WIN + "# one\n", idea="one").id, KEY)
        h = self.hypothesis(PICK_WIN + "# two\n", idea="two")
        with self.at("2026-10-19T06:30:00"), self.assertRaisesRegex(core.LoopError, "ONE EXAM PER WEEK"):
            sealed.evaluate(h.id, KEY)
        self.assertEqual(self.local_exams(), 1)
        with self.at("2026-10-19T07:30:00"):  # Monday 00:30 Vancouver: a new week
            self.assertEqual(sealed.evaluate(h.id, KEY)["n_tested"], 2)

    def test_blocked_period_refuses_seal_and_exam(self):
        plain = self.root / "old.csv"
        plain.write_bytes(exam_csv().replace(b"2027-", b"2025-"))
        sealed.exam_path().chmod(0o644)
        sealed.exam_path().unlink()
        with self.assertRaisesRegex(core.LoopError, "BLOCKED PERIOD(.|\n)*Muse's sealed panel"):
            sealed.seal(plain, KEY)
        self.assertFalse(sealed.exam_path().exists())

    def test_period_blocked_after_sealing_blocks_the_exam(self):
        h = self.hypothesis()
        extra = [{"markets": {"TSXV"}, "start": "2027-01-01", "end": "2027-12-31", "reason": "found out later"}]
        with mock.patch.object(sealed, "blocked_periods", return_value=extra):
            with self.assertRaisesRegex(core.LoopError, "BLOCKED PERIOD(.|\n)*found out later"):
                sealed.evaluate(h.id, KEY)
        self.assertEqual(self.local_exams(), 0)

    def test_unknown_market_is_blocked_by_every_block(self):
        info = {"first_date": "2026-01-05", "last_date": "2026-02-05", "markets": ["UNKNOWN"]}
        with self.assertRaisesRegex(core.LoopError, "BLOCKED PERIOD"):
            sealed.check_fresh(info)
        with self.assertRaisesRegex(core.LoopError, "Gap after Muse's sealed panel"):
            sealed.check_fresh({**info, "first_date": "2026-10-05", "last_date": "2026-12-31", "markets": ["TSX"]})
        sealed.check_fresh({**info, "first_date": "2026-10-11", "last_date": "2026-12-31", "markets": ["TSX"]})
        self.assertEqual(sealed.markets_of(["A.TO", "b.v", "C.CN", "D"]), ["CSE", "TSX", "TSXV", "UNKNOWN"])
        # US tickers carry no suffix, so they're UNKNOWN and caught by the US block (2021-01-01 on),
        # even on days before the Canadian blocks start.
        with self.assertRaisesRegex(core.LoopError, "Test F2"):
            sealed.check_fresh({"first_date": "2021-01-01", "last_date": "2021-01-02", "markets": ["UNKNOWN"]})
        sealed.check_fresh({"first_date": "2021-01-01", "last_date": "2021-01-02", "markets": ["TSX"]})
        with self.assertRaisesRegex(core.LoopError, "US gap"):
            sealed.check_fresh({"first_date": "2026-10-05", "last_date": "2026-10-20", "markets": ["UNKNOWN"]})
        sealed.check_fresh({"first_date": "2026-10-11", "last_date": "2026-12-31", "markets": ["UNKNOWN"]})

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
        # Stopped either way: the fake log has no record of this exam file, nor its identity.
        with self.assertRaisesRegex(core.LoopError, "WRONG EXAM LOG|never recorded in the exam log"):
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

    def test_two_logs_created_in_the_same_second_have_different_identities(self):
        other = Path(self.tmp.name) / "other.git"
        git(Path(self.tmp.name), "init", "-q", "--bare", str(other))
        first = examlog.genesis(examlog.fetch()[0])
        git(self.root, "remote", "set-url", "origin", str(other))
        git(self.root, "update-ref", "-d", "refs/exam-log/last-seen")
        frozen = examlog._git("log", "-1", "--format=%ad", "--date=raw", first)
        with mock.patch.dict(os.environ, {"GIT_AUTHOR_DATE": frozen, "GIT_COMMITTER_DATE": frozen}):
            examlog.init()
        self.assertNotEqual(examlog.genesis(examlog.fetch()[0]), first)

    def test_exam_log_is_never_recreated(self):
        with self.assertRaisesRegex(core.LoopError, "never re-created"):
            examlog.init()


class JudgeTest(unittest.TestCase):
    def test_threshold(self):
        self.assertEqual(backtest.threshold(1), 3.0)
        self.assertEqual(backtest.threshold(90), 3.0)
        self.assertAlmostEqual(backtest.threshold(1000), (2 * __import__("math").log(1000)) ** 0.5)

    # ---- frozen terms

    def test_terms_are_read_from_the_prediction(self):
        t = backtest.terms("PREDICTION\n\nx\n\ncost round trip: 2 %\nMinimum trades: 100\nNewey-West lag: 8\n")
        self.assertEqual(t, {"cost_round_trip": 0.02, "min_trades": 100, "nw_lag": 8})

    def test_terms_missing_or_bad_are_refused(self):
        for text, why in (("PREDICTION\n\nx\n", "Cost round trip: 2%"),
                          (TERMS.replace("Newey-West lag: 5\n", ""), "Newey-West lag"),
                          (TERMS + "Cost round trip: 1%\n", "appears twice"),
                          (TERMS.replace("2%", "two percent"), "percentage"),
                          (TERMS.replace("Minimum trades: 1", "Minimum trades: 0"), "minimum trades >= 1")):
            with self.assertRaisesRegex(backtest.TermsMissing, why):
                backtest.terms(text)

    # ---- data

    def test_parse_cleans_and_reads_endings(self):
        days, endings = backtest.parse(
            b"date,ticker,open,close,volume,event,deal_price\n"
            b"2024-01-03,A,1.9,2,1,,\n2024-01-02,A,0.9,1,,,\n2024-01-02,B,0,5,5,,\n"
            b"bad,A,1,1,1,,\n2024-01-04,A,2,,1,,\n2024-01-04,B,3,3,-7,takeover,4.5\n")
        self.assertEqual(days, [("2024-01-02", [["A", 0.9, 1.0, 0.0]]), ("2024-01-03", [["A", 1.9, 2.0, 1.0]]),
                                ("2024-01-04", [["B", 3.0, 3.0, 0.0]])])
        self.assertEqual(endings, {"B": ("takeover", 4.5)})

    def test_parse_rejects(self):
        h = b"date,ticker,open,close,volume,event,deal_price\n"
        for bad, why in ((h + b"2024-01-02,A,1,1,1,,\n2024-01-02,A,1,1,1,,\n2024-01-03,A,1,1,1,,\n", "duplicate"),
                         (h + b"2024-01-02,A,1,1,1,,\n", "two trading days"),
                         (b"date,ticker,close,volume\n2024-01-02,A,1,1\n", "header"),
                         (h + b"2024-01-02,A,1,1,1,takeover,\n2024-01-03,B,1,1,1,,\n", "deal_price"),
                         (h + b"2024-01-02,A,1,1,1,bankrupt,\n2024-01-03,B,1,1,1,,\n", "unknown event"),
                         (h + b"2024-01-02,A,1,1,1,halt,\n2024-01-03,B,1,1,1,,\n", "unknown event"),
                         (h + b"2024-01-02,A,1,1,1,delisted,\n2024-01-03,A,1,1,1,,\n", "last row"),
                         (b"\xff\xfe", "UTF-8")):
            with self.assertRaisesRegex(backtest.DataFailed, why):
                backtest.parse(bad)

    # ---- scoring (all hand-calculated)

    def test_entry_at_next_open_with_costs(self):
        days = [("d0", [["A", 10, 10, 1], ["B", 10, 10, 1]]), ("d1", [["A", 11, 12, 1], ["B", 10, 10, 1]]),
                ("d2", [["A", 12, 12, 1]])]
        s = backtest.score(days, [{"A": 1}, {}, {}], {}, cost_round_trip=0.02, nw_lag=0)
        # Bought at d1's open (11), not d0's close (10): +12/11-1, minus 1% each way.
        self.assertAlmostEqual(s["net_return"], (1 + 12 / 11 - 1 - 0.01) * (1 - 0.01) - 1)
        self.assertEqual(s["trades"], 1)
        self.assertAlmostEqual(s["benchmark_return"], 1.1 * 1.0 - 1)

    def test_takeover_failure_and_unexplained_endings(self):
        days = [("d0", [["F", 10, 10, 1], ["H", 10, 10, 1], ["T", 10, 10, 1], ["X", 1, 1, 1]]),
                ("d1", [["F", 10, 10, 1], ["H", 10, 10, 1], ["T", 10, 10, 1], ["X", 1, 1, 1]]),
                ("d2", [["X", 1, 1, 1]])]
        w = {"T": 0.3, "F": 0.3, "H": 0.3}
        s = backtest.score(days, [w, w, {}], {"T": ("takeover", 15.0), "F": ("delisted", None)},
                           cost_round_trip=0.02, nw_lag=0)
        # d1: buy 0.9 at the open (0.9% cost). d2: T +50% at the deal price, F -100%,
        # H vanished with no explanation: also -100%.
        self.assertAlmostEqual(s["net_return"], (1 - 0.009) * (1 + 0.3 * 0.5 - 0.3 - 0.3) - 1)
        self.assertEqual((s["takeover_exits"], s["delisted_exits"], s["unexplained_exits"]), (1, 1, 1))

    def test_halted_position_is_stuck_then_marked_on_reopening(self):
        days = [("d0", [["S", 10, 10, 1]]), ("d1", [["S", 10, 10, 1]]), ("d2", [["Y", 1, 1, 1]]),
                ("d3", [["S", 20, 20, 1], ["Y", 1, 1, 1]])]
        s = backtest.score(days, [{"S": 1}, {"S": 1}, {}, {}], {}, cost_round_trip=0.02, nw_lag=0)
        # Can't sell while halted on d2; reopens at 20 on d3 (+100%), sold at that open.
        self.assertAlmostEqual(s["net_return"], (1 - 0.01) * 1.0 * (1 + 1.0 - 0.01) - 1)
        self.assertEqual(s["trades"], 1)

    def test_newey_west(self):
        self.assertAlmostEqual(backtest.newey_west_t([1, 2, 3, 4], 0), 2.5 / (1.25 / 4) ** 0.5)
        self.assertAlmostEqual(backtest.newey_west_t([1, 2, 3, 4], 1), 4.0)
        self.assertEqual(backtest.newey_west_t([1, 1, 1], 2), 0.0)

    # ---- outcomes

    def outcome(self, **stats):
        base = {"days": 100, "trades": 50, "net_return": 0.1, "benchmark_return": 0.0, "mean_daily_net": 0.001,
                "t_stat": 4.0, "takeover_exits": 0, "delisted_exits": 0, "unexplained_exits": 0}
        days = [("d0", [["A", 1, 1, 1]]), ("d1", [["A", 1, 1, 1]])]
        csv_ = b"date,ticker,open,close,volume\n2024-01-02,A,1,1,1\n2024-01-03,A,1,1,1\n"
        with mock.patch.object(backtest.sandbox, "run", return_value=[{}, {}]), \
                mock.patch.object(backtest, "score", return_value={**base, **stats}):
            return backtest.evaluate(csv_, None, n_tested=1,
                                     terms={"cost_round_trip": 0.02, "min_trades": 20, "nw_lag": 5})

    def test_outcomes(self):
        cases = [({}, "PASS", None),
                 ({"trades": 19}, "INCONCLUSIVE", None),
                 ({"t_stat": 2.5}, "INCONCLUSIVE", None),
                 ({"t_stat": 3.0}, "INCONCLUSIVE", None),
                 ({"mean_daily_net": -0.0001}, "FAIL", "HYPOTHESIS_FAILED"),
                 ({"t_stat": -1.0}, "FAIL", "HYPOTHESIS_FAILED"),
                 ({"t_stat": 0.0}, "FAIL", "HYPOTHESIS_FAILED")]
        for stats, result, category in cases:
            r = self.outcome(**stats)
            self.assertEqual((r["result"], r["category"]), (result, category), stats)
        self.assertEqual(self.outcome(mean_daily_net=-0.0001)["detail"], "beat the bar but lost money after costs")


if __name__ == "__main__":
    unittest.main()
