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
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from . import core
from .core import LoopError

MAGIC = b"SEALED1\n"
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**15, 8, 1
MIN_PASSPHRASE = 16


def exam_path() -> Path:
    # Fixed location on purpose: there is no way to point the evaluator elsewhere.
    return core.root() / "data" / "sealed" / "exam.sealed"


def connect():
    conn = core.connect()
    schema = Path(__file__).resolve().parent.parent / "memory" / "schema_sealed.sql"
    conn.executescript(schema.read_text())
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


def seal(plaintext: Path, passphrase: str) -> Path:
    """Encrypt the exam data. Run by the human, ideally where the AI has never had access."""
    if len(passphrase) < MIN_PASSPHRASE:
        raise LoopError(f"Key must be at least {MIN_PASSPHRASE} characters.")
    out = exam_path()
    if out.exists():
        raise LoopError(f"{out.relative_to(core.root())} already exists. There is one exam; "
                        "refusing to replace it.")
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    header = MAGIC + salt + nonce
    ct = AESGCM(_derive(passphrase, salt)).encrypt(nonce, plaintext.read_bytes(), header)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(header + ct)
    out.chmod(0o444)
    return out


def unseal(passphrase: str) -> bytes:
    """Decrypt the exam into memory only. Wrong key or altered file fails."""
    p = exam_path()
    if not p.exists():
        raise LoopError("No sealed exam at data/sealed/exam.sealed.")
    if not passphrase:
        raise LoopError("No key given.")
    blob = p.read_bytes()
    if not blob.startswith(MAGIC) or len(blob) < len(MAGIC) + 28 + 16:
        raise LoopError("data/sealed/exam.sealed is not a sealed exam file.")
    salt = blob[len(MAGIC):len(MAGIC) + 16]
    nonce = blob[len(MAGIC) + 16:len(MAGIC) + 28]
    header, ct = blob[:len(MAGIC) + 28], blob[len(MAGIC) + 28:]
    try:
        return AESGCM(_derive(passphrase, salt)).decrypt(nonce, ct, header)
    except InvalidTag:
        raise LoopError("Wrong key, or the sealed file was altered.") from None


def evaluate(hid: int, passphrase: str, scorer) -> dict:
    """Take hypothesis `hid` into the sealed exam, once.

    `scorer(data: bytes, strategy_path: Path) -> dict` is the judge (Milestone 5).
    """
    conn = connect()
    h = core.get(conn, hid)
    core.verify_integrity(conn, h)
    if conn.execute("SELECT 1 FROM sealed_evaluations WHERE hypothesis_id = ?", (h.id,)).fetchone():
        raise LoopError(f"Hypothesis {h.id:03d} has already taken the sealed exam.\n"
                        "There is no second look. A new idea is a new hypothesis.")
    last = conn.execute(
        "SELECT * FROM attempts WHERE hypothesis_id = ? ORDER BY attempt_no DESC LIMIT 1", (h.id,)
    ).fetchone()
    if last is None or last["kind"] != "test":
        raise LoopError(f"Hypothesis {h.id:03d} has no final strategy attempt to evaluate.\n"
                        f"Its last action must be `./loop attempt {h.id}`.")
    if core.draft_version(conn, h) is not None:
        raise LoopError(f"Hypothesis {h.id:03d} has an unfrozen prediction draft.")

    data = unseal(passphrase)  # wrong key fails here, before the exam is used up
    exam_sha = hashlib.sha256(exam_path().read_bytes()).hexdigest()

    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "INSERT INTO sealed_evaluations (hypothesis_id, attempt_no, strategy_sha256, exam_sha256) "
            "VALUES (?, ?, ?, ?)", (h.id, last["attempt_no"], last["strategy_sha256"], exam_sha))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    # The exam is now recorded as taken. Only after that does the strategy see data.
    result = scorer(data, core.root() / last["strategy_path"])
    conn.execute("INSERT INTO sealed_results (evaluation_id, result_json) VALUES (?, ?)",
                 (cur.lastrowid, json.dumps(result, sort_keys=True)))
    return result
