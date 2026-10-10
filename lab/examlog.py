"""The exam log: an append-only record on the `exam-log` branch of `origin`.

On GitHub, that branch is protected (no force-push, no deletion, no admin
bypass), so the development side can add records but never erase one.
Every exam is pushed here BEFORE the strategy sees sealed data; if the push
fails, the exam does not run. N for the multiple-testing threshold is the
number of exams in this log, not anything in the local SQLite ledger.

Records are written with git plumbing, so the working tree is never touched.
"""

import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from . import core
from .core import LoopError

REMOTE, BRANCH, FILE = "origin", "exam-log", "exam_log.jsonl"
SEEN_REF = "refs/exam-log/last-seen"  # local memory of the newest head we trusted


def _git(*args, input=None, check=True) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "exam-log", "GIT_AUTHOR_EMAIL": "exam-log@localhost",
           "GIT_COMMITTER_NAME": "exam-log", "GIT_COMMITTER_EMAIL": "exam-log@localhost"}
    r = subprocess.run(["git", "-C", str(core.root()), *args], input=input, env=env,
                       capture_output=True, text=True)
    if check and r.returncode != 0:
        raise LoopError(f"git {args[0]} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def fetch() -> tuple[str, list[dict]]:
    """Return (head commit, records). Refuses if the log is missing or was rewritten."""
    r = subprocess.run(["git", "-C", str(core.root()), "fetch", "-q", REMOTE,
                        f"+refs/heads/{BRANCH}:refs/exam-log/remote"], capture_output=True, text=True)
    if r.returncode != 0:
        raise LoopError(f"Cannot read the exam log ({REMOTE}/{BRANCH}). No exam without it.\n"
                        f"If this is a fresh setup, run `./exam_log init`.\n{r.stderr.strip()}")
    head = _git("rev-parse", "refs/exam-log/remote")
    seen = _git("rev-parse", "-q", "--verify", SEEN_REF, check=False)
    if seen and subprocess.run(["git", "-C", str(core.root()), "merge-base", "--is-ancestor", seen, head]
                               ).returncode != 0:
        raise LoopError("EXAM LOG WAS REWRITTEN. The remote history no longer contains records "
                        "this machine has already seen. Stop and check the branch protection.")
    text = _git("show", f"{head}:{FILE}")
    records = [json.loads(line) for line in text.splitlines() if line.strip()]
    _git("update-ref", SEEN_REF, head)
    return head, records


def _append(parent: str | None, records: list[dict], message: str) -> str:
    body = "".join(json.dumps(r, sort_keys=True) + "\n" for r in records)
    blob = _git("hash-object", "-w", "--stdin", input=body)
    tree = _git("mktree", input=f"100644 blob {blob}\t{FILE}\n")
    commit = _git("commit-tree", tree, *(["-p", parent] if parent else []), "-m", message)
    # Never forced: if anyone else pushed in between, this is rejected.
    r = subprocess.run(["git", "-C", str(core.root()), "push", "-q", REMOTE,
                        f"{commit}:refs/heads/{BRANCH}"], capture_output=True, text=True)
    if r.returncode != 0:
        raise LoopError(f"Could not push to the exam log: {r.stderr.strip()}")
    _git("update-ref", SEEN_REF, commit)
    return commit


def init() -> None:
    r = subprocess.run(["git", "-C", str(core.root()), "ls-remote", "--exit-code", REMOTE,
                        f"refs/heads/{BRANCH}"], capture_output=True, text=True)
    if r.returncode == 0:
        raise LoopError(f"{REMOTE}/{BRANCH} already exists. The exam log is never re-created.")
    _append(None, [], "Exam log created")


CODE_DIR = Path(__file__).resolve().parent.parent


def code_state() -> tuple[str, bool]:
    """(commit of the evaluator code, whether it has uncommitted changes)."""
    def git(*a):
        return subprocess.run(["git", "-C", str(CODE_DIR), *a], capture_output=True, text=True).stdout.strip()
    dirty = bool(git("status", "--porcelain", "--", "lab", "memory/schema.sql", "memory/schema_sealed.sql",
                     "loop", "evaluate_sealed", "seal_data", "exam_log", "preflight"))
    return git("rev-parse", "HEAD"), dirty


def exams(records: list[dict]) -> list[dict]:
    return [r for r in records if r.get("type") == "exam"]


def genesis(head: str) -> str:
    return _git("rev-list", "--max-parents=0", head).splitlines()[-1]


def record_exam(fields: dict, sealed_genesis: str) -> int:
    """Append an exam record, refusing a retake. Returns N (exams in the log, this one included).

    `sealed_genesis` comes from inside the key-authenticated exam file: the
    log being written to must be the one that existed when the exam was sealed.
    """
    head, records = fetch()
    if genesis(head) != sealed_genesis:
        raise LoopError("WRONG EXAM LOG. This is not the exam log the sealed exam was bound to "
                        "when it was sealed. Check where `origin` points.")
    keys = ("strategy_sha256", "prediction_sha256", "hypothesis_sha256")
    for old in exams(records):
        for k in keys:
            if old.get(k) == fields[k]:
                raise LoopError(f"RETAKE REFUSED. This {k.split('_')[0]} already took the sealed exam "
                                f"(as hypothesis {old['hypothesis_id']:03d} on {old['started_at']}).")
    commit, dirty = code_state()
    rec = {"type": "exam", "started_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "evaluator_commit": commit + ("-dirty" if dirty else ""), **fields}
    _append(head, records + [rec], f"Exam: hypothesis {fields['hypothesis_id']:03d}")
    return len(exams(records)) + 1


def record_result(hypothesis_id: int, strategy_sha256: str, result: dict) -> None:
    head, records = fetch()
    rec = {"type": "result", "hypothesis_id": hypothesis_id,
           "strategy_sha256": strategy_sha256, "result": result}
    _append(head, records + [rec], f"Result: hypothesis {hypothesis_id:03d} {result.get('result')}")
