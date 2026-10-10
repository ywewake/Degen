"""The sealed-data boundary (Milestone 4).

The exam data lives only as data/sealed/exam.sealed, encrypted with a key
derived from a passphrase that exists only in the human's head. Nothing in
this module reads a key from a file, an argument default, or the environment:
the CLI gets it from a human typing at a terminal, or it refuses.

Development code has no way to get the plaintext: it does not have the key.
"""

import getpass
import hashlib
import json
import os
import secrets
import sqlite3
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from . import backtest, core, examlog, judge, preflight
from .core import LoopError

MAGIC = b"SEALED2\n"
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**15, 8, 1
MIN_PASSPHRASE = 16


def exam_path() -> Path:
    # Fixed location on purpose: there is no way to point the evaluator elsewhere.
    return judge.judge_root() / "data" / "sealed" / "exam.sealed"


def connect():
    """The judge's own database. Never the workspace ledger."""
    db = judge.judge_root() / "memory" / "judge.db"
    db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.executescript((judge.CODE_DIR / "memory" / "schema_sealed.sql").read_text())
    return conn


def workspace_ledger():
    """The workspace's hypothesis ledger, opened read-only."""
    db = core.root() / "memory" / "ledger.db"
    if not db.exists():
        raise LoopError(f"No hypothesis ledger at {db}.")
    conn = sqlite3.connect(f"{db.as_uri()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _derive(passphrase: str, salt: bytes) -> bytes:
    return hashlib.scrypt(passphrase.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R,
                          p=SCRYPT_P, maxmem=64 * 1024 * 1024, dklen=32)


def ask_passphrase(confirm: bool = False) -> str:
    """Read the key from a human at a terminal. No terminal, no key."""
    try:
        os.close(os.open("/dev/tty", os.O_RDWR))
    except OSError:
        raise LoopError("The sealed-data key must be typed by a human at a terminal.\n"
                        "No terminal is attached, so refusing.") from None
    p = getpass.getpass("Sealed-data key: ")
    if confirm and getpass.getpass("Again: ") != p:
        raise LoopError("Keys did not match.")
    if not p:
        raise LoopError("No key given.")
    return p


MARKET_SUFFIXES = {".TO": "TSX", ".V": "TSXV", ".CN": "CSE"}


def markets_of(tickers) -> list[str]:
    """Markets from ticker suffixes. A ticker without a known suffix is UNKNOWN."""
    out = set()
    for t in tickers:
        m = next((mk for suf, mk in MARKET_SUFFIXES.items() if t.upper().endswith(suf)), "UNKNOWN")
        out.add(m)
    return sorted(out)


def blocked_periods() -> list[dict]:
    """Periods already used by some test, from memory/blocked_periods.csv in the evaluator's own
    copy. Removing one is a code change, so it reaches the judge only through an approved update."""
    import csv
    path = judge.CODE_DIR / "memory" / "blocked_periods.csv"
    if not path.exists():
        raise LoopError("memory/blocked_periods.csv is missing. Refusing: without it, no period can be "
                        "shown to be fresh.")
    return [{"markets": set(r["markets"].split(";")), "start": r["start"], "end": r["end"],
             "reason": r["reason"]} for r in csv.DictReader(path.open())]


def check_fresh(info: dict) -> None:
    """Refuse an exam whose period overlaps a blocked period for any of its markets."""
    markets = set(info["markets"])
    for b in blocked_periods():
        applies = "*" in b["markets"] or "UNKNOWN" in markets or markets & b["markets"]
        if applies and info["first_date"] <= b["end"] and info["last_date"] >= b["start"]:
            raise LoopError(
                f"BLOCKED PERIOD. This exam covers {info['first_date']} to {info['last_date']} "
                f"({', '.join(info['markets'])}), which overlaps {b['start']} to {b['end']} for "
                f"{', '.join(sorted(b['markets']))}:\n  {b['reason']}\n"
                "Data from a period that was already tested is worn. Use forward data instead.")


def describe(plaintext: bytes) -> dict:
    """What period and universe an exam covers. Refuses data the judge couldn't score."""
    try:
        days, endings = backtest.parse(plaintext)
    except backtest.DataFailed as e:
        raise LoopError(f"DATA FAILED: {e}. Nothing was sealed.") from None
    tickers = {r[0] for _, rows in days for r in rows}
    return {"first_date": days[0][0], "last_date": days[-1][0], "trading_days": len(days),
            "markets": markets_of(tickers),
            "tickers": len(tickers), "rows": sum(len(rows) for _, rows in days),
            "events": {e: sum(1 for v, _ in endings.values() if v == e) for e in backtest.EVENTS}}


def seal(plaintext: Path, passphrase: str) -> Path:
    """Encrypt the exam data. Run by the human, ideally where the AI has never had access.

    The exam log's identity (its first commit) is sealed in, authenticated by
    the key, so the exam can only ever be recorded in that one log. The exam's
    period and size are recorded in the exam log, permanently.
    """
    if len(passphrase) < MIN_PASSPHRASE:
        raise LoopError(f"Key must be at least {MIN_PASSPHRASE} characters.")
    out = exam_path()
    if out.exists():
        raise LoopError(f"{out} already exists. There is one exam; "
                        "refusing to replace it.")
    info = describe(plaintext.read_bytes())
    check_fresh(info)
    genesis = examlog.genesis(examlog.fetch()[0]).encode()
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    header = MAGIC + bytes([len(genesis)]) + genesis + salt + nonce
    ct = AESGCM(_derive(passphrase, salt)).encrypt(nonce, plaintext.read_bytes(), header)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(header + ct)
    out.chmod(0o444)
    examlog.record_exam_file({"sha256": hashlib.sha256(header + ct).hexdigest(), **info})
    return out


def _open(passphrase: str) -> tuple[str, bytes]:
    """Decrypt the exam into memory only -> (exam log genesis, data). Wrong key or altered file fails."""
    p = exam_path()
    if not p.exists():
        raise LoopError("No sealed exam at data/sealed/exam.sealed.")
    if not passphrase:
        raise LoopError("No key given.")
    blob = p.read_bytes()
    if not blob.startswith(MAGIC) or len(blob) < len(MAGIC) + 1:
        raise LoopError("data/sealed/exam.sealed is not a sealed exam file.")
    i = len(MAGIC) + 1
    g_end = i + blob[len(MAGIC)]
    if len(blob) < g_end + 28 + 16:
        raise LoopError("data/sealed/exam.sealed is not a sealed exam file.")
    salt, nonce = blob[g_end:g_end + 16], blob[g_end + 16:g_end + 28]
    header, ct = blob[:g_end + 28], blob[g_end + 28:]
    try:
        data = AESGCM(_derive(passphrase, salt)).decrypt(nonce, ct, header)
    except InvalidTag:
        raise LoopError("Wrong key, or the sealed file was altered.") from None
    return blob[i:g_end].decode(), data


def unseal(passphrase: str) -> bytes:
    return _open(passphrase)[1]


def evaluate(hid: int, passphrase: str, scorer=backtest.evaluate) -> dict:
    """Take hypothesis `hid` into the sealed exam, once.

    Order matters. Everything that can fail without the strategy seeing sealed
    data happens first (integrity, preflight, key, data check); then the exam is
    recorded in the external exam log and locally; only then does it run.
    """
    ws, conn = workspace_ledger(), connect()
    h = core.get(ws, hid)
    core.verify_integrity(ws, h)
    if conn.execute("SELECT 1 FROM sealed_evaluations WHERE hypothesis_id = ?", (h.id,)).fetchone():
        raise LoopError(f"Hypothesis {h.id:03d} has already taken the sealed exam.\n"
                        "There is no second look. A new idea is a new hypothesis.")
    last = ws.execute(
        "SELECT * FROM attempts WHERE hypothesis_id = ? ORDER BY attempt_no DESC LIMIT 1", (h.id,)
    ).fetchone()
    if last is None or last["kind"] != "test":
        raise LoopError(f"Hypothesis {h.id:03d} has no final strategy attempt to evaluate.\n"
                        f"Its last action must be `./loop attempt {h.id}`.")
    if core.draft_version(ws, h) is not None:
        raise LoopError(f"Hypothesis {h.id:03d} has an unfrozen prediction draft.")
    pred = ws.execute("SELECT * FROM predictions WHERE hypothesis_id = ? ORDER BY version DESC LIMIT 1",
                        (h.id,)).fetchone()
    strategy = core.root() / last["strategy_path"]
    try:
        terms = backtest.terms((core.root() / pred["path"]).read_text())
    except backtest.TermsMissing as e:
        raise LoopError(f"Prediction {h.id:03d} cannot be judged: {e}\n"
                        "Nothing was used. Fixing it needs `./loop revise`, which costs an attempt.") from None

    exam_file = examlog.find_exam_file(hashlib.sha256(exam_path().read_bytes()).hexdigest()
                                       if exam_path().exists() else "")
    if exam_file is None:
        raise LoopError("This sealed exam file was never recorded in the exam log. "
                        "Only an exam sealed with `seal` can be used.")
    check_fresh(exam_file)          # a period blocked after sealing is blocked for good

    preflight.check(strategy)       # a typo costs nothing
    genesis, data = _open(passphrase)  # wrong key fails here, before the exam is used up
    try:
        backtest.parse(data)
    except backtest.DataFailed as e:
        raise LoopError(f"DATA FAILED: the sealed exam is unusable ({e}). No exam was recorded.") from None
    exam_sha = hashlib.sha256(exam_path().read_bytes()).hexdigest()

    n = examlog.record_exam({
        "hypothesis_id": h.id, "title": h.title, "attempt_no": last["attempt_no"],
        "strategy_sha256": last["strategy_sha256"], "prediction_sha256": pred["sha256"],
        "hypothesis_sha256": pred["hypothesis_sha256"], "exam_sha256": exam_sha}, genesis)
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "INSERT INTO sealed_evaluations (hypothesis_id, attempt_no, strategy_sha256, exam_sha256) "
            "VALUES (?, ?, ?, ?)", (h.id, last["attempt_no"], last["strategy_sha256"], exam_sha))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    # The exam is now recorded as taken, remotely and locally. Only now does the strategy see data.
    # The evaluator only recommends. A human confirms the classification (`confirm`).
    result = {**scorer(data, strategy, n_tested=n, terms=terms), "status": "RECOMMENDED"}
    conn.execute("INSERT INTO sealed_results (evaluation_id, result_json) VALUES (?, ?)",
                 (cur.lastrowid, json.dumps(result, sort_keys=True)))
    examlog.record_result(h.id, last["strategy_sha256"], result)
    return result
