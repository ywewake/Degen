"""Imported history (N counts hypotheses tested elsewhere) and the coroner rule
(a human confirms every classification).

Run: python3 -m unittest discover -s tests
"""

import io
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from helpers import make_repo_with_protected_origin
from lab import core, examlog, judge, sealed, sealed_cli
from test_exam import PICK_WIN, exam_csv

KEY = "correct horse battery staple"
HISTORY = """id,title,outcome,t_stat,decided,note
H1,Selloff rebound,FAIL,1.2,2026-06-01,
H9,Overnight gap fade (liquid-only),FAIL,-3.19,2026-10-10,confirmed dead
H-2026-05,Crypto test,PENDING,,,own dataset and own 99% bar
H17,Insider cluster buys (forward),PENDING,,,rules frozen at forward/RULES-FROZEN.md
"""


@unittest.skipUnless(shutil.which("bwrap"), "bubblewrap not installed")
class HistoryAndConfirmationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "repo"
        self.root.mkdir()
        os.environ["LOOP_ROOT"] = str(self.root)
        make_repo_with_protected_origin(self.root)
        examlog.init()
        (self.root / "exam.csv").write_bytes(exam_csv())
        sealed.seal(self.root / "exam.csv", KEY)
        (self.root / "exam.csv").unlink()
        self.history = Path(self.tmp.name) / "history.csv"
        self.history.write_text(HISTORY)

    def tearDown(self):
        for p in Path(self.tmp.name).rglob("*"):
            if p.is_file():
                p.chmod(0o644)
        self.tmp.cleanup()
        del os.environ["LOOP_ROOT"]

    def cli(self, *argv, typed=()):
        """Run ./exam_log with `typed` as the human's terminal answers."""
        answers = iter(typed)
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(judge, "ask_at_terminal", side_effect=lambda prompt: next(answers)), \
                redirect_stdout(out), redirect_stderr(err):
            code = sealed_cli.exam_log_main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def examined(self):
        h = core.new_idea("Winners keep winning")
        (h.dir / "hypothesis.md").write_text("IDEA\n\nwinners\n")
        (h.dir / "prediction.md").write_text("PREDICTION\n\nwinners win\n")
        (h.dir / "strategy.py").write_text(PICK_WIN)
        core.freeze(h.id)
        core.attempt(h.id)
        return sealed.evaluate(h.id, KEY)

    # ---- imported history

    def test_import_raises_n_for_the_next_exam(self):
        self.assertEqual(self.cli("import", str(self.history), typed=["APPROVE"])[0], 0)
        r = self.examined()
        self.assertEqual(r["n_tested"], 5)  # 4 imported + this one

    def test_import_needs_approval_at_a_terminal(self):
        code, _, err = self.cli("import", str(self.history), typed=["yes"])
        self.assertEqual(code, 1)
        self.assertIn("Not approved", err)
        self.assertEqual(examlog.n_tested(examlog.fetch()[1]), 0)
        with mock.patch("builtins.open", side_effect=OSError):  # no terminal at all
            with self.assertRaisesRegex(core.LoopError, "needs a human at a terminal"):
                judge.ask_at_terminal("?")

    def test_reimport_is_refused(self):
        self.cli("import", str(self.history), typed=["APPROVE"])
        code, _, err = self.cli("import", str(self.history), typed=["APPROVE"])
        self.assertEqual(code, 1)
        self.assertIn("Already imported: H1, H9, H-2026-05, H17", err)
        self.assertEqual(examlog.n_tested(examlog.fetch()[1]), 4)

    def test_bad_history_files_are_refused(self):
        for bad, why in (("id,title\nH1,x\n", "header"),
                         (HISTORY.replace("FAIL,1.2", "DEAD,1.2"), "outcome must be"),
                         (HISTORY + "H1,again,FAIL,,,\n", "appears twice"),
                         (HISTORY.replace("-3.19", "minus three"), "t_stat must be")):
            with self.assertRaisesRegex(core.LoopError, why):
                examlog.parse_history(bad)

    def test_log_shows_history_and_n(self):
        self.cli("import", str(self.history), typed=["APPROVE"])
        _, out, _ = self.cli()
        self.assertIn("N = 4 (4 imported, 0 examined here)", out)
        self.assertIn("H9", out)
        self.assertIn("t=-3.19", out)

    # ---- the coroner rule

    def test_result_is_only_recommended_until_a_human_confirms(self):
        r = self.examined()
        self.assertEqual(r["status"], "RECOMMENDED")
        self.assertIn("RECOMMENDED PASS", self.cli()[1])
        code, out, err = self.cli("confirm", "1", "PASS", typed=["Edge held out of sample."])
        self.assertEqual(code, 0, err)
        self.assertIn("CONFIRMED PASS", self.cli()[1])
        rec = [r for r in examlog.fetch()[1] if r["type"] == "confirmation"][0]
        self.assertEqual((rec["recommended"], rec["classification"], rec["reason"]),
                         ("PASS", "PASS", "Edge held out of sample."))

    def test_human_can_override_the_category(self):
        self.examined()
        self.cli("confirm", "1", "data_failed", typed=["Feed was missing delisted names."])
        rec = [r for r in examlog.fetch()[1] if r["type"] == "confirmation"][0]
        self.assertEqual((rec["recommended"], rec["classification"]), ("PASS", "DATA_FAILED"))

    def test_confirmation_is_final(self):
        self.examined()
        self.cli("confirm", "1", "PASS", typed=["ok"])
        code, _, err = self.cli("confirm", "1", "HYPOTHESIS_FAILED", typed=["changed my mind"])
        self.assertEqual(code, 1)
        self.assertIn("already confirmed", err)

    def test_confirmation_needs_a_reason_and_a_result(self):
        code, _, err = self.cli("confirm", "1", "PASS", typed=["why"])
        self.assertIn("no exam in the log", err)
        self.examined()
        code, _, err = self.cli("confirm", "1", "PASS", typed=[""])
        self.assertIn("written reason is required", err)
        code, _, err = self.cli("confirm", "1", "PROBABLY_FINE", typed=["x"])
        self.assertIn("Classification must be one of", err)
        self.assertNotIn("confirmation", [r["type"] for r in examlog.fetch()[1]])


if __name__ == "__main__":
    unittest.main()
