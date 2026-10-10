"""Where the judge lives.

Single-user mode (no judge.conf next to this code): the judge's files sit in
the workspace itself. Fine for tests and for trying things out.

Judge mode: this code is the `judge` Linux user's own clone, set up by
scripts/setup_judge.sh, with a root-owned judge.conf naming the workspace.
The judge clone holds the evaluator code, the sealed exam, the judge
database and the exam-log git memory. The AI's user cannot write any of it,
and can read none of it. The judge only ever reads the workspace.
"""

import os
import pwd
from pathlib import Path

from . import core
from .core import LoopError

CODE_DIR = Path(__file__).resolve().parent.parent
CONF = CODE_DIR / "judge.conf"
DEFAULT_JUDGE_USER = "judge"

# Files that decide how an exam is judged. Uncommitted changes block an exam,
# and `degen-judge update` shows their diff before you approve it.
EVALUATOR_PATHS = ("lab", "memory/schema.sql", "memory/schema_sealed.sql", "loop", "evaluate_sealed",
                   "seal_data", "exam_log", "preflight", "degen-judge", "scripts/setup_judge.sh")


def _conf() -> dict:
    out = {}
    for line in CONF.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def judge_mode() -> bool:
    return CONF.exists()


def judge_root() -> Path:
    return CODE_DIR if judge_mode() else core.root()


def enter() -> None:
    """Called first by degen-judge: check who we are, then point at the workspace."""
    if not judge_mode():
        raise LoopError("This copy is not a judge installation (no judge.conf). "
                        "Set one up with scripts/setup_judge.sh.")
    conf = _conf()
    me = pwd.getpwuid(os.getuid()).pw_name
    if me != conf["user"]:
        raise LoopError(f"degen-judge must run as the '{conf['user']}' user: "
                        f"sudo -u {conf['user']} degen-judge ...")
    os.environ["LOOP_ROOT"] = conf["workspace"]


def refuse_if_judge_installed() -> None:
    """Guard for the workspace copies of the sealed commands.

    Once a judge exists, the key must only ever be typed into the judge's
    code. The workspace copy is writable by the AI and could capture it.
    """
    if judge_mode():
        return
    try:
        pwd.getpwnam(DEFAULT_JUDGE_USER)
    except KeyError:
        return
    raise LoopError(f"A '{DEFAULT_JUDGE_USER}' user exists on this machine, so sealed commands run "
                    f"only through it:\n\n    sudo -u {DEFAULT_JUDGE_USER} degen-judge <command>\n\n"
                    "Never type the sealed-data key into this copy: it is writable by the AI.")


def confirm_at_terminal(prompt: str, word: str) -> None:
    """Require a human to type `word` at the terminal. No terminal, no approval."""
    try:
        with open("/dev/tty", "r+") as tty:
            tty.write(f"{prompt}\nType {word} to continue: ")
            tty.flush()
            answer = tty.readline().strip()
    except OSError:
        raise LoopError("This needs a human at a terminal. No terminal is attached, so refusing.") from None
    if answer != word:
        raise LoopError("Not approved. Nothing changed.")
