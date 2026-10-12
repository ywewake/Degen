"""./loop — command line for the research machine."""

import argparse
import sys

from . import core


def cmd_new(a):
    h = core.new_idea(" ".join(a.title))
    rel = h.dir.relative_to(core.root())
    print(f"Created hypothesis {h.id:03d}: {h.title}\n")
    print(f"  {rel}/hypothesis.md   the idea, in one or two sentences")
    print(f"  {rel}/prediction.md   what you expect, and what would prove it wrong")
    print(f"  {rel}/strategy.py     the experiment\n")
    print(f"Next: fill in hypothesis.md and prediction.md, then `./loop freeze {h.id}`.")


def cmd_freeze(a):
    v = core.freeze(a.id)
    print(f"Prediction {a.id:03d} v{v} is frozen. It can no longer be edited.")
    print(f"Next: write strategy.py, then `./loop attempt {a.id}`.")


def cmd_revise(a):
    n = core.revise(a.id)
    print(f"Opened a new prediction version for {a.id:03d}. This used attempt {n} of {core.MAX_ATTEMPTS}.")
    print(f"Edit it, then `./loop freeze {a.id}`.")


def cmd_attempt(a):
    n, snap = core.attempt(a.id)
    print(f"Attempt {n} of {core.MAX_ATTEMPTS} for hypothesis {a.id:03d} recorded.")
    print(f"Frozen strategy: {snap.relative_to(core.root())}")


def cmd_ideas(a):
    rows = core.ideas()
    if not rows:
        print("No ideas yet. Start one with `./loop new \"<title>\"`.")
        return
    w = max(28, *(len(r["title"]) for r in rows))
    print(f"{'ID':<5}{'IDEA':<{w + 2}}{'ATTEMPTS':<10}RESULT")
    for r in rows:
        print(f"{r['id']:<5}{r['title']:<{w + 2}}{r['attempts']:<10}{r['result']}")


def main(argv=None):
    p = argparse.ArgumentParser(prog="loop", description="Hypothesis research machine.")
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("new", help="create a hypothesis"); s.add_argument("title", nargs="+"); s.set_defaults(fn=cmd_new)
    s = sub.add_parser("freeze", help="freeze the prediction"); s.add_argument("id", type=int); s.set_defaults(fn=cmd_freeze)
    s = sub.add_parser("revise", help="new prediction version (costs an attempt)"); s.add_argument("id", type=int); s.set_defaults(fn=cmd_revise)
    s = sub.add_parser("attempt", help="snapshot strategy.py as the next attempt"); s.add_argument("id", type=int); s.set_defaults(fn=cmd_attempt)
    s = sub.add_parser("ideas", help="list every hypothesis"); s.set_defaults(fn=cmd_ideas)
    a = p.parse_args(argv)
    try:
        a.fn(a)
    except core.LoopError as e:
        print(f"ERROR\n\n{e}", file=sys.stderr)
        return 1
    return 0
