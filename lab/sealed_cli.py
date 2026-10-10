"""./seal_data, ./evaluate_sealed, ./exam_log and ./preflight."""

import sys
from pathlib import Path

from . import backtest, core, examlog, judge, preflight, sealed


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
        judge.refuse_if_judge_installed()
        src = Path(argv[0])
        if not src.is_file():
            raise core.LoopError(f"{src} is not a file.")
        info = sealed.describe(src.read_bytes())
        sealed.check_fresh(info)  # before asking anyone to attest anything
        print(f"Exam period: {info['first_date']} to {info['last_date']} ({info['trading_days']} trading days), "
              f"markets {', '.join(info['markets'])}")
        print(f"Universe: {info['tickers']} tickers, {info['rows']} rows; endings: "
              + ", ".join(f"{k} {v}" for k, v in info["events"].items()))
        judge.confirm_at_terminal(
            "\nThis period is recorded in the exam log permanently. Seal it only if NO system has\n"
            "tested a hypothesis on it (a period used before is worn, even when encrypted).", "FRESH")
        out = sealed.seal(src, sealed.ask_passphrase(confirm=True))
        print(f"Sealed to {out}.")
        print(f"Now delete {src} from anywhere the AI can reach. The key is not stored anywhere.")
    return _run(go)


def evaluate_main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print("usage: ./evaluate_sealed <hypothesis id>", file=sys.stderr)
        return 2

    def go():
        judge.refuse_if_judge_installed()
        commit, dirty = examlog.code_state()
        if dirty:
            raise core.LoopError("The evaluator code has uncommitted changes. Commit (and review) them "
                                 "first, so the exam record names the exact code that judged it.")
        examlog.fetch()  # fail on a missing exam log before asking for the key
        r = sealed.evaluate(int(argv[0]), sealed.ask_passphrase())
        print(f"Hypothesis: {int(argv[0]):03d}\n")
        print(f"N hypotheses tested: {r['n_tested']}")
        print(f"Required t-stat: {r['required_t_stat']}\n")
        print(f"Frozen terms: cost {r['cost_round_trip']:.2%} round trip, minimum {r['min_trades']} trades, "
              f"Newey-West lag {r['nw_lag']}\n")
        if "t_stat" in r:
            print("Observed:")
            print(f"Days: {r['days']}")
            print(f"Trades: {r['trades']}")
            print(f"Net return: {r['net_return']:+.1%} (mean daily {r['mean_daily_net']:+.4%})")
            print(f"Benchmark return: {r['benchmark_return']:+.1%}")
            print(f"Exits: {r['takeover_exits']} takeover, {r['delisted_exits']} delisted, "
                  f"{r['unexplained_exits']} unexplained (counted -100%)")
            print(f"t-stat (Newey-West): {r['t_stat']:.2f}\n")
        line = f"RECOMMENDED: {r['result']}" + (f" ({r['category']})" if r["category"] else "")
        if r.get("detail"):
            line += f": {r['detail']}"
        print(line)
        print(f"\nNot final until you confirm it: confirm {int(argv[0])} <CLASSIFICATION>")
        print(f"Evaluator commit: {commit}")
    return _run(go)


def exam_log_main(argv):
    def go():
        judge.refuse_if_judge_installed()
        if argv == ["init"]:
            examlog.init()
            print(f"Created {examlog.REMOTE}/{examlog.BRANCH}. Protect it on GitHub now.")
        elif argv == []:
            show_log()
        elif len(argv) == 2 and argv[0] == "import":
            import_history(Path(argv[1]))
        elif len(argv) == 3 and argv[0] == "confirm" and argv[1].isdigit():
            confirm(int(argv[1]), argv[2])
        else:
            print("usage: ./exam_log [init | import <history.csv> | confirm <id> <CLASSIFICATION>]",
                  file=sys.stderr)
            return 2
    return _run(go)


def show_log():
    _, records = examlog.fetch()
    n = examlog.n_tested(records)
    print(f"N = {n} ({len(examlog.priors(records))} imported, {len(examlog.exams(records))} examined here); "
          f"next threshold {backtest.threshold(n + 1):.2f}\n")
    for f in examlog.exam_files(records):
        print(f"Sealed exam: {f['first_date']} to {f['last_date']}, {f['tickers']} tickers "
              f"(sealed {f['sealed_at']})")
    print()
    for p in examlog.priors(records):
        t = f"t={p['t_stat']:+.2f}" if p["t_stat"] is not None else ""
        print(f"{p['decided'] or '-':<20}  {p['id']:<11}  {p['title'][:40]:<40}  {p['outcome']:<13} {t}  (imported)")
    results = {(r["hypothesis_id"], r["strategy_sha256"]): r["result"]
               for r in records if r.get("type") == "result"}
    confirmed = {(r["hypothesis_id"], r["strategy_sha256"]): r["classification"]
                 for r in records if r.get("type") == "confirmation"}
    for e in examlog.exams(records):
        key = (e["hypothesis_id"], e["strategy_sha256"])
        res = results.get(key)
        if key in confirmed:
            status = f"CONFIRMED {confirmed[key]}"
        elif res:
            status = f"RECOMMENDED {res.get('category') or res['result']}"
        else:
            status = "NO RESULT"
        print(f"{e['started_at']:<20}  {e['hypothesis_id']:03d}{'':<8}  {e['title'][:40]:<40}  {status}")


def import_history(path: Path):
    if not path.is_file():
        raise core.LoopError(f"{path} is not a file.")
    rows = examlog.parse_history(path.read_text())
    for r in rows:
        t = f"t={r['t_stat']:+.2f}" if r["t_stat"] is not None else ""
        print(f"{r['id']:<11}  {r['title'][:45]:<45}  {r['outcome']:<13} {t}")
    judge.confirm_at_terminal(f"\n{len(rows)} hypotheses will be added to the exam log PERMANENTLY. "
                              "Each one raises N. Check the list against your ledger.", "APPROVE")
    n = examlog.import_history(rows, path.name)
    print(f"Imported {len(rows)}. N is now {n}.")


def confirm(hid: int, classification: str):
    if classification.upper() not in examlog.CLASSIFICATIONS:
        raise core.LoopError(f"Classification must be one of {', '.join(examlog.CLASSIFICATIONS)}.")
    reason = judge.ask_at_terminal(f"Why is hypothesis {hid:03d} {classification.upper()}? "
                                   "(one line, recorded permanently): ")
    examlog.confirm(hid, classification, reason)
    print(f"Hypothesis {hid:03d} confirmed {classification.upper()}. This is final.")


def preflight_main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print("usage: ./preflight <hypothesis id>", file=sys.stderr)
        return 2

    def go():
        h = core.get(core.connect(), int(argv[0]))
        preds = sorted(h.dir.glob("prediction*.md"), key=lambda p: (len(p.name), p.name))
        try:
            t = backtest.terms(preds[-1].read_text())
        except backtest.TermsMissing as e:
            raise core.LoopError(f"{preds[-1].name}: {e}\nAdd them before freezing.") from None
        preflight.check(h.dir / "strategy.py")
        print(f"Preflight passed for {h.dir.relative_to(core.root())}/strategy.py "
              f"({len(preflight.cases())} ugly cases).")
        print(f"Terms in {preds[-1].name}: cost {t['cost_round_trip']:.2%} round trip, "
              f"minimum {t['min_trades']} trades, Newey-West lag {t['nw_lag']}.")
    return _run(go)
