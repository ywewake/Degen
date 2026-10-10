"""./seal_data, ./evaluate_sealed, ./exam_log and ./preflight."""

import sys
from pathlib import Path

from . import backtest, core, examlog, preflight, sealed


def _run(fn):
    try:
        return fn() or 0
    except core.LoopError as e:
        print(f"ERROR\n\n{e}", file=sys.stderr)
        return 1


def seal_main(argv):
    if len(argv) != 1:
        print("usage: ./seal_data <plaintext file>", file=sys.stderr)
        return 2

    def go():
        src = Path(argv[0])
        if not src.is_file():
            raise core.LoopError(f"{src} is not a file.")
        out = sealed.seal(src, sealed.ask_passphrase(confirm=True))
        print(f"Sealed to {out.relative_to(core.root())}.")
        print(f"Now delete {src} from anywhere the AI can reach. The key is not stored anywhere.")
    return _run(go)


def evaluate_main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print("usage: ./evaluate_sealed <hypothesis id>", file=sys.stderr)
        return 2

    def go():
        commit, dirty = examlog.code_state()
        if dirty:
            raise core.LoopError("The evaluator code has uncommitted changes. Commit (and review) them "
                                 "first, so the exam record names the exact code that judged it.")
        examlog.fetch()  # fail on a missing exam log before asking for the key
        r = sealed.evaluate(int(argv[0]), sealed.ask_passphrase())
        print(f"Hypothesis: {int(argv[0]):03d}\n")
        print(f"N hypotheses tested: {r['n_tested']}")
        print(f"Required t-stat: {r['required_t_stat']}\n")
        if "t_stat" in r:
            print("Observed:")
            print(f"Days: {r['days']}")
            print(f"Trades: {r['trades']}")
            print(f"Net return: {r['net_return']:+.1%}")
            print(f"Benchmark return: {r['benchmark_return']:+.1%}")
            print(f"t-stat: {r['t_stat']:.2f}\n")
        line = f"RESULT: {r['result']}"
        if r["category"] in ("DATA_FAILED", "IMPLEMENTATION_FAILED"):
            line += f" ({r['category']}: {r['detail']})"
        print(line)
        print(f"Evaluator commit: {commit}")
    return _run(go)


def exam_log_main(argv):
    def go():
        if argv == ["init"]:
            examlog.init()
            print(f"Created {examlog.REMOTE}/{examlog.BRANCH}. Protect it on GitHub now.")
        elif argv == []:
            _, records = examlog.fetch()
            exams = examlog.exams(records)
            print(f"N = {len(exams)} exams; next threshold {backtest.threshold(len(exams) + 1):.2f}\n")
            results = {(r["hypothesis_id"], r["strategy_sha256"]): r["result"]
                       for r in records if r.get("type") == "result"}
            for e in exams:
                res = results.get((e["hypothesis_id"], e["strategy_sha256"]), {})
                print(f"{e['started_at']}  {e['hypothesis_id']:03d}  {e['title'][:40]:<40}  "
                      f"{res.get('result', 'NO RESULT')}")
        else:
            print("usage: ./exam_log [init]", file=sys.stderr)
            return 2
    return _run(go)


def preflight_main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print("usage: ./preflight <hypothesis id>", file=sys.stderr)
        return 2

    def go():
        h = core.get(core.connect(), int(argv[0]))
        preflight.check(h.dir / "strategy.py")
        print(f"Preflight passed for {h.dir.relative_to(core.root())}/strategy.py "
              f"({len(preflight.cases())} ugly cases).")
    return _run(go)
