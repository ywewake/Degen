"""Rules of the research machine: create ideas, freeze predictions, count attempts.

The ledger (SQLite) is the source of truth. Files on disk are checked against
the SHA-256 hashes recorded at freeze/attempt time, so editing a frozen file
is detected even when filesystem permissions are bypassed.
"""

import hashlib
import os
import re
import shutil
import sqlite3
import stat
from dataclasses import dataclass
from pathlib import Path

MAX_ATTEMPTS = 3

HYPOTHESIS_TEMPLATE = """\
# Hypothesis {num:03d}: {title}

IDEA

<One or two plain sentences. What do you think happens, and why?>
"""

PREDICTION_TEMPLATE = """\
# Prediction {num:03d}

PREDICTION

<If this pattern is real, what exactly should we observe?
Which universe, which benchmark, over what horizon?>

Success condition:
t-stat > sealed threshold.

Expected direction:
<positive | negative>

Falsification:
If the sealed test does not exceed the threshold,
the hypothesis is considered unsuccessful.

Terms (frozen with this prediction; the judge refuses an exam without them):
Cost round trip: 2%
Minimum trades: 100
Newey-West lag: 20
"""

STRATEGY_TEMPLATE = '''\
"""Strategy for hypothesis {num:03d}: {title}

Written during development. Each `./loop attempt` snapshots this file to
strategies/h{num:03d}_v<attempt>.py, and that snapshot is what gets judged.
The strategy interface is defined in Milestone 5 (sealed evaluator).
"""


def generate_signals(prices):
    raise NotImplementedError
'''


class LoopError(Exception):
    """A rule said no. The message is shown to the user as-is."""


@dataclass
class Hypothesis:
    id: int
    title: str
    dir: Path
    created_at: str


def root() -> Path:
    return Path(os.environ.get("LOOP_ROOT", Path(__file__).resolve().parent.parent))


def connect() -> sqlite3.Connection:
    db = root() / "memory" / "ledger.db"
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db, isolation_level=None)  # explicit transactions only
    conn.row_factory = sqlite3.Row
    schema = Path(__file__).resolve().parent.parent / "memory" / "schema.sql"
    conn.executescript(schema.read_text())
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_read_only(path: Path) -> None:
    path.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)


def prediction_file(h: Hypothesis, version: int) -> Path:
    return h.dir / ("prediction.md" if version == 1 else f"prediction_v{version}.md")


def get(conn: sqlite3.Connection, hid: int) -> Hypothesis:
    row = conn.execute("SELECT * FROM hypotheses WHERE id = ?", (hid,)).fetchone()
    if row is None:
        raise LoopError(f"No hypothesis {hid:03d}.")
    return Hypothesis(row["id"], row["title"], root() / row["dir"], row["created_at"])


def frozen_version(conn, h: Hypothesis) -> int:
    """Latest frozen prediction version, 0 if never frozen."""
    return conn.execute(
        "SELECT COALESCE(MAX(version), 0) FROM predictions WHERE hypothesis_id = ?", (h.id,)
    ).fetchone()[0]


def attempts_used(conn, h: Hypothesis) -> int:
    return conn.execute(
        "SELECT COUNT(*) FROM attempts WHERE hypothesis_id = ?", (h.id,)
    ).fetchone()[0]


def draft_version(conn, h: Hypothesis) -> int | None:
    """Version number of an unfrozen prediction draft, if one exists."""
    nxt = frozen_version(conn, h) + 1
    return nxt if prediction_file(h, nxt).exists() else None


def verify_integrity(conn, h: Hypothesis) -> None:
    """Refuse to continue if any frozen file no longer matches the ledger."""
    problems = []
    rows = conn.execute(
        "SELECT version, path, sha256, hypothesis_sha256 FROM predictions "
        "WHERE hypothesis_id = ? ORDER BY version", (h.id,)
    ).fetchall()
    for r in rows:
        p = root() / r["path"]
        if not p.exists() or sha256(p) != r["sha256"]:
            problems.append(f"{r['path']} was changed or removed after freezing")
    if rows:
        hyp = h.dir / "hypothesis.md"
        if not hyp.exists() or sha256(hyp) != rows[-1]["hypothesis_sha256"]:
            problems.append(f"{hyp.relative_to(root())} was changed or removed after freezing")
    for r in conn.execute(
        "SELECT strategy_path, strategy_sha256 FROM attempts "
        "WHERE hypothesis_id = ? AND kind = 'test'", (h.id,)
    ):
        p = root() / r["strategy_path"]
        if not p.exists() or sha256(p) != r["strategy_sha256"]:
            problems.append(f"{r['strategy_path']} was changed or removed after its attempt")
    if problems:
        raise LoopError(
            f"TAMPERING DETECTED in hypothesis {h.id:03d}:\n  - " + "\n  - ".join(problems)
            + "\nThe ledger is the record. Restore the files from git, or bury this "
              "hypothesis and start a new one."
        )


# ---------------------------------------------------------------- commands

def new_idea(title: str) -> Hypothesis:
    title = title.strip()
    if not title:
        raise LoopError("Give the idea a title.")
    conn = connect()
    conn.execute("BEGIN IMMEDIATE")
    d = None
    try:
        num = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM hypotheses").fetchone()[0]
        rel = Path("research") / f"hypothesis_{num:03d}"
        candidate = root() / rel
        if candidate.exists():
            raise LoopError(f"{rel} already exists on disk but not in the ledger. Refusing to reuse it.")
        conn.execute("INSERT INTO hypotheses (id, title, dir) VALUES (?, ?, ?)", (num, title, str(rel)))
        candidate.mkdir(parents=True)
        d = candidate
        for name, tpl in (("hypothesis.md", HYPOTHESIS_TEMPLATE),
                          ("prediction.md", PREDICTION_TEMPLATE),
                          ("strategy.py", STRATEGY_TEMPLATE)):
            (d / name).write_text(tpl.format(num=num, title=title))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        if d is not None and d.exists():  # we created it in this call
            shutil.rmtree(d)
        raise
    return get(conn, num)


def freeze(hid: int) -> int:
    """Freeze the current prediction draft (and hypothesis.md). Returns the version."""
    conn = connect()
    h = get(conn, hid)
    conn.execute("BEGIN IMMEDIATE")
    try:
        verify_integrity(conn, h)
        version = draft_version(conn, h)
        if version is None:
            raise LoopError(
                f"Prediction {h.id:03d} is frozen.\n\n"
                f"Create a new prediction version with `./loop revise {h.id}`.\n"
                f"This consumes another attempt."
            )
        for name, tpl in (("hypothesis.md", HYPOTHESIS_TEMPLATE),
                          (prediction_file(h, version).name, PREDICTION_TEMPLATE)):
            p = h.dir / name
            if version == 1 and p.read_text() == tpl.format(num=h.id, title=h.title):
                raise LoopError(f"{p.relative_to(root())} is still the blank template. Fill it in first.")
        pred = prediction_file(h, version)
        hyp = h.dir / "hypothesis.md"
        conn.execute(
            "INSERT INTO predictions (hypothesis_id, version, path, sha256, hypothesis_sha256) "
            "VALUES (?, ?, ?, ?, ?)",
            (h.id, version, str(pred.relative_to(root())), sha256(pred), sha256(hyp)),
        )
        make_read_only(pred)
        make_read_only(hyp)
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return version


def _claim_attempt(conn, h: Hypothesis) -> int:
    used = attempts_used(conn, h)
    if used >= MAX_ATTEMPTS:
        raise LoopError(
            f"NO MORE ATTEMPTS.\n\nHypothesis {h.id:03d} has used {used} of {MAX_ATTEMPTS}.\n"
            f"A human must explicitly create a new hypothesis (`./loop new`)."
        )
    return used + 1


def revise(hid: int) -> int:
    """Open a new prediction version for editing. Costs one attempt."""
    conn = connect()
    h = get(conn, hid)
    conn.execute("BEGIN IMMEDIATE")
    try:
        verify_integrity(conn, h)
        current = frozen_version(conn, h)
        if current == 0:
            raise LoopError(f"Prediction {h.id:03d} is not frozen yet. Edit it directly, then `./loop freeze {h.id}`.")
        if draft_version(conn, h) is not None:
            raise LoopError(f"A draft prediction v{current + 1} already exists. Edit it, then `./loop freeze {h.id}`.")
        n = _claim_attempt(conn, h)
        conn.execute(
            "INSERT INTO attempts (hypothesis_id, attempt_no, kind, prediction_version) "
            "VALUES (?, ?, 'prediction_revision', ?)", (h.id, n, current),
        )
        src, dst = prediction_file(h, current), prediction_file(h, current + 1)
        dst.write_text(src.read_text())
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return n


def attempt(hid: int) -> tuple[int, Path]:
    """Snapshot strategy.py as the next attempt. Returns (attempt_no, snapshot path)."""
    conn = connect()
    h = get(conn, hid)
    conn.execute("BEGIN IMMEDIATE")
    written = None
    try:
        verify_integrity(conn, h)
        version = frozen_version(conn, h)
        if version == 0:
            raise LoopError(f"Prediction {h.id:03d} is not frozen. Run `./loop freeze {h.id}` first.")
        if draft_version(conn, h) is not None:
            raise LoopError(f"Prediction draft v{version + 1} is not frozen. Run `./loop freeze {h.id}` first.")
        strategy = h.dir / "strategy.py"
        if not strategy.exists():
            raise LoopError(f"{strategy.relative_to(root())} is missing.")
        if strategy.read_text() == STRATEGY_TEMPLATE.format(num=h.id, title=h.title):
            raise LoopError(f"{strategy.relative_to(root())} is still the blank template.")
        n = _claim_attempt(conn, h)
        snap = root() / "strategies" / f"h{h.id:03d}_v{n}.py"
        if snap.exists():
            raise LoopError(f"{snap.relative_to(root())} already exists but is not in the ledger. Refusing to overwrite it.")
        snap.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(strategy, snap)
        written = snap
        conn.execute(
            "INSERT INTO attempts (hypothesis_id, attempt_no, kind, prediction_version, "
            "strategy_path, strategy_sha256) VALUES (?, ?, 'test', ?, ?, ?)",
            (h.id, n, version, str(snap.relative_to(root())), sha256(snap)),
        )
        make_read_only(snap)
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        if written is not None and written.exists():  # only what this call wrote
            written.chmod(0o644)
            written.unlink()
        raise
    return n, snap


def ideas() -> list[dict]:
    conn = connect()
    out = []
    for row in conn.execute("SELECT id FROM hypotheses ORDER BY id"):
        h = get(conn, row["id"])
        used = attempts_used(conn, h)
        if frozen_version(conn, h) == 0:
            result = "DRAFT"
        elif draft_version(conn, h) is not None:
            result = "REVISING"
        elif used >= MAX_ATTEMPTS:
            result = "NO ATTEMPTS LEFT"
        elif used == 0:
            result = "FROZEN"
        else:
            result = "ACTIVE"
        out.append({"id": h.id, "title": h.title, "attempts": used, "result": result})
    return out

