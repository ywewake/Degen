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
import secrets
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from . import judge
from .core import LoopError

REMOTE, BRANCH, FILE = "origin", "exam-log", "exam_log.jsonl"
SEEN_REF = "refs/exam-log/last-seen"  # local memory of the newest head we trusted


def _git(*args, input=None, check=True) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "exam-log", "GIT_AUTHOR_EMAIL": "exam-log@localhost",
           "GIT_COMMITTER_NAME": "exam-log", "GIT_COMMITTER_EMAIL": "exam-log@localhost"}
    r = subprocess.run(["git", "-C", str(judge.judge_root()), *args], input=input, env=env,
                       capture_output=True, text=True)
    if check and r.returncode != 0:
        raise LoopError(f"git {args[0]} failed: {r.stderr.strip()}")
    return r.stdout.strip()


def fetch() -> tuple[str, list[dict]]:
    """Return (head commit, records). Refuses if the log is missing or was rewritten."""
    r = subprocess.run(["git", "-C", str(judge.judge_root()), "fetch", "-q", REMOTE,
                        f"+refs/heads/{BRANCH}:refs/exam-log/remote"], capture_output=True, text=True)
    if r.returncode != 0:
        raise LoopError(f"Cannot read the exam log ({REMOTE}/{BRANCH}). No exam without it.\n"
                        f"If this is a fresh setup, run `./exam_log init`.\n{r.stderr.strip()}")
    head = _git("rev-parse", "refs/exam-log/remote")
    seen = _git("rev-parse", "-q", "--verify", SEEN_REF, check=False)
    if seen and subprocess.run(["git", "-C", str(judge.judge_root()), "merge-base", "--is-ancestor", seen, head]
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
    r = subprocess.run(["git", "-C", str(judge.judge_root()), "push", "-q", REMOTE,
                        f"{commit}:refs/heads/{BRANCH}"], capture_output=True, text=True)
    if r.returncode != 0:
        raise LoopError(f"Could not push to the exam log: {r.stderr.strip()}")
    _git("update-ref", SEEN_REF, commit)
    return commit


def init() -> None:
    r = subprocess.run(["git", "-C", str(judge.judge_root()), "ls-remote", "--exit-code", REMOTE,
                        f"refs/heads/{BRANCH}"], capture_output=True, text=True)
    if r.returncode == 0:
        raise LoopError(f"{REMOTE}/{BRANCH} already exists. The exam log is never re-created.")
    # The random nonce makes this log's first commit unique: the sealed exam is bound to it,
    # so an independently created log can never have the same identity, even within the same second.
    _append(None, [], f"Exam log created\n\nnonce: {secrets.token_hex(16)}")


CODE_DIR = judge.CODE_DIR


def code_state() -> tuple[str, bool]:
    """(commit of the evaluator code, whether it has uncommitted changes)."""
    def git(*a):
        return subprocess.run(["git", "-C", str(CODE_DIR), *a], capture_output=True, text=True).stdout.strip()
    dirty = bool(git("status", "--porcelain", "--", *judge.EVALUATOR_PATHS))
    return git("rev-parse", "HEAD"), dirty


def exams(records: list[dict]) -> list[dict]:
    return [r for r in records if r.get("type") == "exam"]


def priors(records: list[dict]) -> list[dict]:
    """Hypotheses tested outside this loop, imported so N counts them."""
    return [r for r in records if r.get("type") == "prior"]


def n_tested(records: list[dict]) -> int:
    return len(exams(records)) + len(priors(records))


PRIOR_OUTCOMES = ("PASS", "FAIL", "INCONCLUSIVE", "PENDING")
CLASSIFICATIONS = ("PASS", "HYPOTHESIS_FAILED", "IMPLEMENTATION_FAILED", "DATA_FAILED")


def parse_history(text: str) -> list[dict]:
    """CSV with header id,title,outcome,t_stat,decided,note. One row per prior hypothesis."""
    import csv
    import io
    reader = csv.DictReader(io.StringIO(text))
    need = {"id", "title", "outcome", "t_stat", "decided", "note"}
    if not reader.fieldnames or not need <= set(reader.fieldnames):
        raise LoopError(f"History file needs the header: {','.join(sorted(need))}")
    rows, seen = [], set()
    for i, r in enumerate(reader, start=2):
        rid, outcome = (r["id"] or "").strip(), (r["outcome"] or "").strip().upper()
        if not rid or not (r["title"] or "").strip():
            raise LoopError(f"Line {i}: id and title are required.")
        if outcome not in PRIOR_OUTCOMES:
            raise LoopError(f"Line {i}: outcome must be one of {', '.join(PRIOR_OUTCOMES)}.")
        if rid in seen:
            raise LoopError(f"Line {i}: id {rid} appears twice.")
        seen.add(rid)
        t = (r["t_stat"] or "").strip()
        try:
            t_stat = float(t) if t else None
        except ValueError:
            raise LoopError(f"Line {i}: t_stat must be a number or empty.") from None
        rows.append({"id": rid, "title": r["title"].strip(), "outcome": outcome, "t_stat": t_stat,
                     "decided": (r["decided"] or "").strip(), "note": (r["note"] or "").strip()})
    if not rows:
        raise LoopError("History file has no rows.")
    return rows


def import_history(rows: list[dict], source: str) -> int:
    """Append prior hypotheses. Refuses an id already in the log. Returns the new N."""
    head, records = fetch()
    have = {p["id"] for p in priors(records)}
    dup = [r["id"] for r in rows if r["id"] in have]
    if dup:
        raise LoopError(f"Already imported: {', '.join(dup)}. The exam log never changes a record.")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    new = [{"type": "prior", "imported_at": now, "source": source, **r} for r in rows]
    _append(head, records + new, f"Imported {len(new)} prior hypotheses from {source}")
    return n_tested(records) + len(new)


def confirm(hypothesis_id: int, classification: str, reason: str) -> None:
    """The coroner rule: a human confirms (or overrides) the evaluator's classification."""
    classification = classification.upper()
    if classification not in CLASSIFICATIONS:
        raise LoopError(f"Classification must be one of {', '.join(CLASSIFICATIONS)}.")
    if not reason.strip():
        raise LoopError("A written reason is required.")
    head, records = fetch()
    exam = [e for e in exams(records) if e["hypothesis_id"] == hypothesis_id]
    if not exam:
        raise LoopError(f"Hypothesis {hypothesis_id:03d} has no exam in the log.")
    key = (hypothesis_id, exam[-1]["strategy_sha256"])
    result = [r for r in records if r.get("type") == "result"
              and (r["hypothesis_id"], r["strategy_sha256"]) == key]
    if not result:
        raise LoopError(f"Hypothesis {hypothesis_id:03d} has no result to confirm.")
    if any(r.get("type") == "confirmation" and (r["hypothesis_id"], r["strategy_sha256"]) == key
           for r in records):
        raise LoopError(f"Hypothesis {hypothesis_id:03d} is already confirmed. Confirmations are final.")
    rec = {"type": "confirmation", "hypothesis_id": hypothesis_id, "strategy_sha256": key[1],
           "recommended": result[-1]["result"].get("category") or result[-1]["result"].get("result"),
           "classification": classification, "reason": reason.strip(),
           "confirmed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    _append(head, records + [rec], f"Confirmed: hypothesis {hypothesis_id:03d} {classification}")


def genesis(head: str) -> str:
    return _git("rev-list", "--max-parents=0", head).splitlines()[-1]


def record_exam(fields: dict, sealed_genesis: str) -> int:
    """Append an exam record, refusing a retake. Returns N (exams + imported priors, this one included).

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
    return n_tested(records) + 1


def record_result(hypothesis_id: int, strategy_sha256: str, result: dict) -> None:
    head, records = fetch()
    rec = {"type": "result", "hypothesis_id": hypothesis_id,
           "strategy_sha256": strategy_sha256, "result": result}
    _append(head, records + [rec], f"Result: hypothesis {hypothesis_id:03d} {result.get('result')}")
