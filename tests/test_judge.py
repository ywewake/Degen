"""The judge boundary, with real Linux users.

Creates two users (an AI-side workspace user and a judge), runs
scripts/setup_judge.sh, then attacks the judge from the workspace user.
It creates and deletes system users, so it only runs when asked:

    sudo DEGEN_TEST_USERS=1 python3 -m unittest tests.test_judge
"""

import os
import sys
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from lab import judge
from test_exam import PICK_WIN, TERMS, exam_csv

REPO = Path(__file__).resolve().parent.parent
DEV, JUDGE = "djdev", "djjudge"
KEY = "correct horse battery staple"
ENABLED = os.environ.get("DEGEN_TEST_USERS") == "1" and os.geteuid() == 0 and shutil.which("bwrap")
CODE = ["lab", "memory/schema.sql", "memory/schema_sealed.sql", "memory/blocked_periods.csv", "loop", "new_idea", "evaluate_sealed",
        "seal_data", "exam_log", "preflight", "degen-judge", "scripts", "requirements.txt", ".gitignore"]


def copy_code(dest: Path) -> None:
    for c in CODE:
        src, dst = REPO / c, dest / c
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__"))
        else:
            shutil.copy2(src, dst)


def run_as(user, *cmd, cwd=None, input=None):
    return subprocess.run(["runuser", "-u", user, "--", *cmd], cwd=cwd, input=input,
                          capture_output=True, text=True)


def ok(r):
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout


@unittest.skipUnless(ENABLED, "set DEGEN_TEST_USERS=1 and run as root (creates system users)")
class JudgeBoundaryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for u in (DEV, JUDGE):
            subprocess.run(["userdel", "-r", u], capture_output=True)
        subprocess.run(["useradd", "-m", DEV], check=True)
        cls.tmp = Path(tempfile.mkdtemp())
        cls.tmp.chmod(0o755)
        # "GitHub": a bare repo both users can push to, protected like the exam-log branch.
        cls.remote = cls.tmp / "github.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", "--shared=0777", str(cls.remote)], check=True)
        for k in ("receive.denyNonFastForwards", "receive.denyDeletes"):
            subprocess.run(["git", "-C", str(cls.remote), "config", k, "true"], check=True)
        cls.bin = cls.tmp / "bin"
        cls.bin.mkdir()
        # The workspace: the dev user's clone of the current code.
        cls.ws = Path(f"/home/{DEV}/Degen")
        stage = cls.tmp / "stage"
        stage.mkdir()
        copy_code(stage)
        subprocess.run(["chown", "-R", f"{DEV}:{DEV}", str(stage)], check=True)
        g = ("-c", "user.name=dev", "-c", "user.email=dev@localhost")
        ok(run_as(DEV, "git", "init", "-q", "-b", "main", cwd=stage))
        ok(run_as(DEV, "git", "add", "-A", cwd=stage))
        ok(run_as(DEV, "git", *g, "commit", "-q", "-m", "code", cwd=stage))
        ok(run_as(DEV, "git", "push", "-q", str(cls.remote), "main", cwd=stage))
        ok(run_as(DEV, "git", "clone", "-q", str(cls.remote), str(cls.ws)))
        # The setup script, as root.
        env = {**os.environ, "JUDGE_USER": JUDGE, "BIN_DIR": str(cls.bin)}
        r = subprocess.run([str(REPO / "scripts/setup_judge.sh"), str(cls.ws), str(cls.remote)],
                           env=env, capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr
        cls.jcode = Path(f"/home/{JUDGE}/Degen")
        cls.wrapper = cls.bin / "degen-judge"
        ok(run_as(JUDGE, str(cls.wrapper), "init"))
        plain = cls.tmp / "exam.csv"
        plain.write_bytes(exam_csv())
        plain.chmod(0o644)
        cls.judge_py("sealed.seal(Path(%r), KEY)" % str(plain))
        plain.unlink()

    @classmethod
    def tearDownClass(cls):
        for u in (DEV, JUDGE):
            subprocess.run(["userdel", "-r", u], capture_output=True)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    @classmethod
    def judge_py(cls, code):
        """Run library code as the judge (stands in for the human typing the key)."""
        prog = ("import sys, json; sys.path.insert(0, %r)\nfrom pathlib import Path\n"
                "from lab import judge, sealed, examlog\nKEY = %r\njudge.enter()\n" % (str(cls.jcode), KEY)) + code
        return run_as(JUDGE, "python3", "-c", prog, cwd=f"/home/{JUDGE}")

    def dev_sh(self, script):
        return run_as(DEV, "sh", "-c", script, cwd=str(self.ws))

    def new_hypothesis(self, idea, strategy=PICK_WIN):
        out = ok(self.dev_sh(f"./loop new '{idea}'"))
        hid = int(out.split("hypothesis ")[1].split(":")[0])
        d = f"research/hypothesis_{hid:03d}"
        ok(run_as(DEV, "sh", "-c", f"printf 'IDEA\\n\\n{idea}\\n' > {d}/hypothesis.md && "
                  f"printf 'PREDICTION\\n\\n{idea} wins.\\n\\nCost round trip: 2%%\\nMinimum trades: 1\\nNewey-West lag: 5\\n' "
                  f"> {d}/prediction.md && cat > {d}/strategy.py",
                  cwd=str(self.ws), input=strategy))
        ok(self.dev_sh(f"./loop freeze {hid} && ./loop attempt {hid}"))
        return hid

    def evaluate(self, hid):
        return self.judge_py(f"print(json.dumps(sealed.evaluate({hid}, KEY)))")

    # ---- the AI's user cannot touch the judge

    def test_ai_user_cannot_read_or_write_judge_files(self):
        attacks = {
            "edit evaluator code": f"echo 'x' >> {self.jcode}/lab/backtest.py",
            "read evaluator code": f"cat {self.jcode}/lab/backtest.py",
            "read sealed exam": f"cat {self.jcode}/data/sealed/exam.sealed",
            "delete exam-log memory": f"git -C {self.jcode} update-ref -d refs/exam-log/last-seen",
            "repoint judge origin": f"git -C {self.jcode} remote set-url origin /tmp/fake.git",
            "edit judge.conf": f"echo 'workspace = /tmp' > {self.jcode}/judge.conf",
            "delete judge database": f"rm -f {self.jcode}/memory/judge.db",
            "replace degen-judge": f"echo 'exit 0' > {self.wrapper}",
            "read judge home": f"ls /home/{JUDGE}",
        }
        for name, cmd in attacks.items():
            self.assertNotEqual(self.dev_sh(cmd).returncode, 0, f"NOT STOPPED: {name}")

    def test_degen_judge_refuses_any_other_user(self):
        r = run_as(DEV, str(self.wrapper), "log")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn(f"sudo -u {JUDGE}", r.stderr)

    def test_judge_reads_workspace_but_cannot_write_it(self):
        r = run_as(JUDGE, "sh", "-c", f"cat {self.ws}/loop >/dev/null && ! touch {self.ws}/x 2>/dev/null")
        self.assertEqual(r.returncode, 0, r.stderr)

    # ---- the exam, through the judge

    def test_exam_once_and_no_retake_after_workspace_wipe_and_forged_log(self):
        hid = self.new_hypothesis("Winners keep winning")
        r = self.evaluate(hid)
        self.assertIn('"result": "PASS"', ok(r))
        self.assertIn("already taken the sealed exam", self.evaluate(hid).stderr)
        # The attack that beat single-user mode: wipe the workspace, fork the log at its
        # first commit, point the workspace's origin at the fork, start over.
        fake = f"/home/{DEV}/fake.git"
        ok(self.dev_sh(
            f"rm -rf memory/ledger.db research strategies && "
            f"git fetch -q origin exam-log && git init -q --bare {fake} && "
            f"git push -q {fake} $(git rev-list --max-parents=0 FETCH_HEAD):refs/heads/exam-log && "
            f"git remote set-url origin {fake}"))
        hid = self.new_hypothesis("Winners keep winning")
        self.assertIn("RETAKE REFUSED", self.evaluate(hid).stderr)

    def test_update_needs_human_approval_for_evaluator_changes(self):
        before = ok(run_as(JUDGE, "git", "-C", str(self.jcode), "rev-parse", "HEAD")).strip()
        g = "git -c user.name=dev -c user.email=dev@localhost"
        ok(self.dev_sh("git checkout -q -b cheat && "
                       "sed -i 's/max(3.0,/max(0.0,/' lab/backtest.py && "
                       f"{g} commit -qam 'lower the bar' && git push -q {self.remote} cheat"))
        r = run_as(JUDGE, str(self.wrapper), "update", "cheat")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("max(0.0,", r.stdout)  # the diff was shown
        after = ok(run_as(JUDGE, "git", "-C", str(self.jcode), "rev-parse", "HEAD")).strip()
        self.assertEqual(before, after)


class GuardTest(unittest.TestCase):
    def test_workspace_sealed_commands_refuse_once_a_judge_exists(self):
        from unittest import mock
        with mock.patch("pwd.getpwnam", return_value=object()), \
                mock.patch.object(judge, "judge_mode", return_value=False):
            with self.assertRaisesRegex(Exception, "sudo -u judge degen-judge"):
                judge.refuse_if_judge_installed()


if __name__ == "__main__":
    unittest.main()


@unittest.skipUnless(shutil.which("bwrap"), "bubblewrap not installed")
class JudgeModeTest(unittest.TestCase):
    """Judge-mode code paths without OS users: a separate judge copy (with judge.conf)
    reads a separate workspace. The OS permission boundary is JudgeBoundaryTest's job."""

    def setUp(self):
        import getpass
        self.tmp = Path(tempfile.mkdtemp())
        self.remote = self.tmp / "github.git"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(self.remote)], check=True)
        for k in ("receive.denyNonFastForwards", "receive.denyDeletes"):
            subprocess.run(["git", "-C", str(self.remote), "config", k, "true"], check=True)
        stage = self.tmp / "stage"
        stage.mkdir()
        copy_code(stage)
        g = ["git", "-c", "user.name=t", "-c", "user.email=t@localhost"]
        self.g = g
        for cmd in (["init", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "code"],
                    ["push", "-q", str(self.remote), "main"]):
            subprocess.run([*g, "-C", str(stage), *cmd], check=True, capture_output=True)
        self.ws, self.jcode = self.tmp / "ws", self.tmp / "judge"
        for d in (self.ws, self.jcode):
            subprocess.run(["git", "clone", "-q", str(self.remote), str(d)], check=True)
        (self.jcode / "judge.conf").write_text(f"workspace = {self.ws}\nuser = {getpass.getuser()}\n")
        self.judge_py("examlog.init()")
        (self.tmp / "exam.csv").write_bytes(exam_csv())
        self.judge_py(f"sealed.seal(Path({str(self.tmp / 'exam.csv')!r}), KEY)")

    def tearDown(self):
        for p in self.tmp.rglob("*"):
            if p.is_file() and not p.is_symlink():
                p.chmod(0o644)
        shutil.rmtree(self.tmp)

    def judge_py(self, code):
        prog = ("import sys, json; sys.path.insert(0, %r)\nfrom pathlib import Path\n"
                "from lab import judge, sealed, examlog\nKEY = %r\njudge.enter()\n" % (str(self.jcode), KEY)) + code
        env = {k: v for k, v in os.environ.items() if k != "LOOP_ROOT"}
        r = subprocess.run([sys.executable, "-c", prog], cwd=self.tmp, env=env, capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        return r.stdout

    def workspace_loop(self, *args, input=None):
        env = {k: v for k, v in os.environ.items() if k != "LOOP_ROOT"}
        return subprocess.run([str(self.ws / "loop"), *args], cwd=self.ws, env=env, input=input,
                              capture_output=True, text=True, check=True).stdout

    def new_hypothesis(self):
        self.workspace_loop("new", "Winners")
        d = self.ws / "research/hypothesis_001"
        (d / "hypothesis.md").write_text("IDEA\n\nwinners\n")
        (d / "prediction.md").write_text("PREDICTION\n\nwinners win\n\n" + TERMS)
        (d / "strategy.py").write_text(PICK_WIN)
        self.workspace_loop("freeze", "1")
        self.workspace_loop("attempt", "1")

    def test_exam_state_lives_in_judge_copy_and_workspace_is_only_read(self):
        self.new_hypothesis()
        ledger = self.ws / "memory/ledger.db"
        before = ledger.read_bytes()
        out = self.judge_py("print(json.dumps(sealed.evaluate(1, KEY)))")
        self.assertIn('"result": "PASS"', out)
        self.assertEqual(ledger.read_bytes(), before)
        self.assertTrue((self.jcode / "memory/judge.db").exists())
        self.assertTrue((self.jcode / "data/sealed/exam.sealed").exists())
        self.assertFalse((self.ws / "memory/judge.db").exists())
        self.assertFalse((self.ws / "data/sealed").exists())

    def test_enter_refuses_wrong_user(self):
        (self.jcode / "judge.conf").write_text(f"workspace = {self.ws}\nuser = nobody-else\n")
        with self.assertRaises(AssertionError) as e:
            self.judge_py("pass")
        self.assertIn("must run as the 'nobody-else' user", str(e.exception))

    def test_update_shows_diff_and_needs_approval(self):
        head = lambda: subprocess.run(["git", "-C", str(self.jcode), "rev-parse", "HEAD"],
                                      capture_output=True, text=True).stdout.strip()
        before = head()
        subprocess.run(["sed", "-i", "s/max(3.0,/max(0.0,/", str(self.ws / "lab/backtest.py")], check=True)
        for cmd in (["checkout", "-q", "-b", "cheat"], ["commit", "-qam", "lower the bar"],
                    ["push", "-q", "origin", "cheat"]):
            subprocess.run([*self.g, "-C", str(self.ws), *cmd], check=True, capture_output=True)
        env = {k: v for k, v in os.environ.items() if k != "LOOP_ROOT"}
        r = subprocess.run([str(self.jcode / "degen-judge"), "update", "cheat"], env=env,
                           capture_output=True, text=True, stdin=subprocess.DEVNULL,
                           start_new_session=True)  # no controlling terminal
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("max(0.0,", r.stdout)
        self.assertIn("needs a human at a terminal", r.stderr)
        self.assertEqual(head(), before)

    def test_update_without_evaluator_changes_needs_no_approval(self):
        (self.ws / "TRADING.md").write_text("notes\n")
        for cmd in (["checkout", "-q", "-b", "docs"], ["add", "TRADING.md"], ["commit", "-qm", "docs"],
                    ["push", "-q", "origin", "docs"]):
            subprocess.run([*self.g, "-C", str(self.ws), *cmd], check=True, capture_output=True)
        env = {k: v for k, v in os.environ.items() if k != "LOOP_ROOT"}
        r = subprocess.run([str(self.jcode / "degen-judge"), "update", "docs"], env=env,
                           capture_output=True, text=True, start_new_session=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("No changes to evaluator files", r.stdout)
