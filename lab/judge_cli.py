"""degen-judge: the sealed commands, run as the `judge` user from the judge's own copy.

    sudo -u judge degen-judge init            create the exam log (once)
    sudo -u judge degen-judge seal <file>     encrypt the exam (once)
    sudo -u judge degen-judge evaluate <id>   take the sealed exam
    sudo -u judge degen-judge log             every exam ever taken, plus imported history
    sudo -u judge degen-judge import-history <file.csv>   add hypotheses tested elsewhere (raises N)
    sudo -u judge degen-judge confirm <id> <CLASSIFICATION>   the coroner rule: you confirm a result
    sudo -u judge degen-judge update <ref>    move the judge's code to <ref>, after you approve the diff
"""

import subprocess
import sys

from . import judge, sealed_cli
from .core import LoopError


def update(ref: str) -> None:
    def git(*a, check=True):
        r = subprocess.run(["git", "-C", str(judge.CODE_DIR), *a], capture_output=True, text=True)
        if check and r.returncode != 0:
            raise LoopError(f"git {a[0]} failed: {r.stderr.strip()}")
        return r.stdout
    git("fetch", "-q", "origin", ref)
    cur, new = git("rev-parse", "HEAD").strip(), git("rev-parse", "FETCH_HEAD").strip()
    if cur == new:
        print(f"Judge code is already at {cur[:12]}.")
        return
    diff = git("diff", cur, new, "--", *judge.EVALUATOR_PATHS)
    print(f"Judge code: {cur[:12]} -> {new[:12]} ({ref})\n")
    print(git("log", "--oneline", f"{cur}..{new}") or "(not a fast-forward)")
    print(diff if diff else "No changes to evaluator files.")
    if diff:
        judge.confirm_at_terminal("Read the evaluator changes above. They decide how every future exam "
                                  "is judged.", "APPROVE")
    git("checkout", "-q", "--detach", new)
    print(f"Judge code is now at {new[:12]}.")


def main(argv):
    try:
        judge.enter()
    except LoopError as e:
        print(f"ERROR\n\n{e}", file=sys.stderr)
        return 1
    cmd, rest = (argv[0], argv[1:]) if argv else ("", [])
    if cmd == "init" and not rest:
        return sealed_cli.exam_log_main(["init"])
    if cmd == "log" and not rest:
        return sealed_cli.exam_log_main([])
    if cmd == "import-history" and len(rest) == 1:
        return sealed_cli.exam_log_main(["import", rest[0]])
    if cmd == "confirm" and len(rest) == 2:
        return sealed_cli.exam_log_main(["confirm", *rest])
    if cmd == "seal":
        return sealed_cli.seal_main(rest)
    if cmd == "evaluate":
        return sealed_cli.evaluate_main(rest)
    if cmd == "update" and len(rest) == 1:
        try:
            update(rest[0])
            return 0
        except LoopError as e:
            print(f"ERROR\n\n{e}", file=sys.stderr)
            return 1
    print(__doc__, file=sys.stderr)
    return 2
