"""Run a strategy with no network, no writable disk and no view of the repo.

Uses bubblewrap (Linux / WSL2). There is no unsandboxed fallback: if bwrap is
missing, nothing runs.
"""

import json
import math
import os
import resource
import shutil
import subprocess
import threading
from pathlib import Path

from .core import LoopError

RUNNER = Path(__file__).resolve().parent / "runner.py"
MEMORY_LIMIT = 2 * 1024**3   # bytes of address space
MAX_WEIGHT_SUM = 1.0 + 1e-9  # long-only, no leverage


class StrategyFailed(Exception):
    """The strategy crashed, hung, or returned something invalid."""

    def __init__(self, reason: str, stderr: str = ""):
        super().__init__(reason)
        self.reason, self.stderr = reason, stderr


def _bwrap_cmd(strategy: Path) -> list[str]:
    bwrap = shutil.which("bwrap")
    if bwrap is None:
        raise LoopError("bubblewrap (bwrap) is not installed. The strategy never runs unsandboxed.\n"
                        "Install it: sudo apt install bubblewrap")
    python = os.path.realpath("/usr/bin/python3")  # skip /etc/alternatives, not mounted
    if not python.startswith("/usr/"):
        raise LoopError(f"System python resolves to {python}, outside /usr. Cannot sandbox it.")
    cmd = [bwrap, "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
           "--ro-bind", "/usr", "/usr"]
    for d in ("/bin", "/lib", "/lib64", "/sbin"):
        if os.path.islink(d):
            cmd += ["--symlink", os.readlink(d), d]
        elif os.path.isdir(d):
            cmd += ["--ro-bind", d, d]
    cmd += ["--proc", "/proc", "--dev", "/dev",
            "--ro-bind", str(RUNNER), "/sandbox/runner.py",
            "--ro-bind", str(strategy), "/sandbox/strategy.py",
            "--remount-ro", "/", "--chdir", "/sandbox",
            python, "-I", "-S", "-B", "/sandbox/runner.py"]
    return cmd


def _limits(timeout):
    def apply():
        resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT, MEMORY_LIMIT))
        resource.setrlimit(resource.RLIMIT_CPU, (timeout, timeout))
    return apply


def _valid(w, universe: set) -> dict:
    if not isinstance(w, dict):
        raise StrategyFailed("returned something other than a dict of weights")
    out = {}
    for t, x in w.items():
        if t not in universe:
            raise StrategyFailed("weighted a ticker with no price today")
        if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) or x < 0:
            raise StrategyFailed("returned a negative, non-numeric or non-finite weight")
        if x > 0:
            out[t] = float(x)
    if sum(out.values()) > MAX_WEIGHT_SUM:
        raise StrategyFailed("weights sum to more than 1 (no leverage)")
    return out


def run(strategy: Path, days: list[tuple[str, list]], timeout: int = 600) -> list[dict]:
    """Feed `days` one at a time; return one validated weight dict per day."""
    proc = subprocess.Popen(_bwrap_cmd(strategy), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, preexec_fn=_limits(timeout))
    timer = threading.Timer(timeout, proc.kill)
    timer.start()
    stderr = []
    reader = threading.Thread(target=lambda: stderr.append(proc.stderr.read()), daemon=True)
    reader.start()
    weights = []
    try:
        for date, rows in days:
            try:
                proc.stdin.write(json.dumps({"date": date, "rows": rows}) + "\n")
                proc.stdin.flush()
            except BrokenPipeError:
                break
            line = proc.stdout.readline()
            if not line:
                break
            try:
                msg = json.loads(line)
            except ValueError:
                raise StrategyFailed("wrote something other than weights to stdout") from None
            weights.append(_valid(msg.get("w") if isinstance(msg, dict) else None,
                                  {r[0] for r in rows}))
    finally:
        try:
            proc.stdin.close()
        except BrokenPipeError:
            pass
        killed = not timer.is_alive()
        timer.cancel()
        proc.kill()
        proc.wait()
        reader.join(5)
    if len(weights) != len(days):
        raise StrategyFailed("timed out" if killed else "crashed", "".join(stderr))
    return weights
