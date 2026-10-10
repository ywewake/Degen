"""Seatbelt: run a strategy on ugly synthetic data before it may take the exam.

A failure here means IMPLEMENTATION FAILED, not BAD STRATEGY, and costs
nothing: no attempt, no exam. The data is synthetic, so the strategy's error
output is safe to show.
"""

import random

from . import sandbox
from .core import LoopError


def _walk(rng, n_days, tickers, start=1.0):
    px = {t: start for t in tickers}
    days = []
    for i in range(n_days):
        rows = []
        for t in tickers:
            op = px[t] * (1 + rng.gauss(0, 0.01))
            px[t] *= 1 + rng.gauss(0, 0.03)
            rows.append([t, round(op, 6), round(px[t], 6), float(rng.randint(0, 50_000))])
        days.append((f"2020-01-{i + 1:02d}" if i < 31 else f"2020-02-{i - 30:02d}", rows))
    return days


def cases() -> dict[str, list]:
    rng = random.Random(0)
    normal = _walk(rng, 40, ["AAA.V", "BBB.V", "CCC.TO"])
    flat = [(d, [[t, 1.0, 1.0, v] for t, _, _, v in rows]) for d, rows in normal]
    zero_vol = [(d, [[t, o, c, 0.0] for t, o, c, _ in rows]) for d, rows in normal]
    gap = [(d, [[t, o * k, c * k, v] for t, o, c, v in rows
                for k in [10 if 15 <= i < 20 and t == "AAA.V" else 1]])
           for i, (d, rows) in enumerate(normal)]
    disappears = [(d, [r for r in rows if not (r[0] == "BBB.V" and i >= 10)])
                  for i, (d, rows) in enumerate(normal)]
    appears_late = [(d, [r for r in rows if not (r[0] == "CCC.TO" and i < 25)])
                    for i, (d, rows) in enumerate(normal)]
    return {
        "normal": normal,
        "one day": normal[:1],
        "one ticker": [(d, rows[:1]) for d, rows in normal],
        "flat prices": flat,
        "zero volume": zero_vol,
        "huge gap": gap,
        "stock disappears": disappears,
        "stock appears late": appears_late,
        "penny prices": _walk(rng, 20, ["PNY.CN"], start=0.005),
        "many tickers": _walk(rng, 5, [f"T{i:03d}.V" for i in range(300)]),
    }


def check(strategy) -> None:
    for name, days in cases().items():
        try:
            sandbox.run(strategy, days, timeout=60)
        except sandbox.StrategyFailed as e:
            tail = "\n".join(e.stderr.strip().splitlines()[-8:])
            raise LoopError(f"IMPLEMENTATION FAILED in preflight case '{name}': {e.reason}."
                            + (f"\n\n{tail}" if tail else "")
                            + "\n\nNothing was used up. Fix strategy.py (if this was a frozen attempt, "
                            "make a new one with `./loop attempt`).") from None
