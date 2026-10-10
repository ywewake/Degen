"""The judge. Trusted code: parses prices, runs the sandboxed strategy, scores it.

Fixed rules (a prediction cannot change them):
  * Data: CSV with header date,ticker,close,volume (date as YYYY-MM-DD).
    Rows with a bad date or a missing/non-positive close are dropped.
    A duplicate (date, ticker) makes the dataset unusable (DATA_FAILED).
  * Each day the strategy returns long-only weights (sum <= 1) using only
    data up to that day. They are held from that day's close to the next
    trading day's close.
  * A held ticker with no price on the next day is marked at its next
    available close (the whole gap is booked that day). If it never trades
    again, the position is a total loss (-100%).
  * Cost: COST_BPS per unit of turnover, every rebalance.
  * Benchmark: equal-weighted return of every ticker priced on both days.
  * Score: t-stat of daily (net portfolio - benchmark) returns.
  * Pass: t-stat > max(3.0, sqrt(2 ln N)), N = hypotheses ever examined.
"""

import bisect
import csv
import io
import math
from datetime import date as Date

from . import sandbox

COST_BPS = 50


class DataFailed(Exception):
    pass


def threshold(n_tested: int) -> float:
    return max(3.0, math.sqrt(2 * math.log(max(n_tested, 1))))


def parse(data: bytes) -> list[tuple[str, list]]:
    """CSV bytes -> [(date, [[ticker, close, volume], ...]), ...] sorted by date."""
    try:
        reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    except UnicodeDecodeError:
        raise DataFailed("not UTF-8 text") from None
    if not reader.fieldnames or not {"date", "ticker", "close", "volume"} <= set(reader.fieldnames):
        raise DataFailed("header must include date,ticker,close,volume")
    by_date, seen = {}, set()
    for r in reader:
        try:
            d = Date.fromisoformat((r["date"] or "").strip()).isoformat()
            close = float(r["close"])
        except (ValueError, TypeError):
            continue
        ticker = (r["ticker"] or "").strip()
        if not ticker or not math.isfinite(close) or close <= 0:
            continue
        try:
            volume = float(r["volume"])
            volume = volume if math.isfinite(volume) and volume >= 0 else 0.0
        except (ValueError, TypeError):
            volume = 0.0
        if (d, ticker) in seen:
            raise DataFailed("duplicate row for one (date, ticker)")
        seen.add((d, ticker))
        by_date.setdefault(d, []).append([ticker, close, volume])
    if len(by_date) < 2:
        raise DataFailed("fewer than two trading days")
    return [(d, sorted(by_date[d])) for d in sorted(by_date)]


def score(days: list[tuple[str, list]], weights: list[dict]) -> dict:
    closes = [{t: c for t, c, _ in rows} for _, rows in days]
    later = {}  # ticker -> [(day index, close), ...]
    for i, c in enumerate(closes):
        for t, px in c.items():
            later.setdefault(t, []).append((i, px))

    def next_close(t, i):
        k = bisect.bisect_right(later[t], (i, math.inf))
        return later[t][k][1] if k < len(later[t]) else None

    held, excess, port_growth, bench_growth, trades = {}, [], 1.0, 1.0, 0
    for i in range(len(days) - 1):
        today, nxt, target = closes[i], closes[i + 1], weights[i]
        trades += sum(1 for t in target if t not in held)
        turnover = sum(abs(target.get(t, 0) - held.get(t, 0)) for t in set(target) | set(held))
        port = 0.0
        for t, w in target.items():
            px = next_close(t, i)
            port += w * (px / today[t] - 1 if px is not None else -1.0)
        port -= turnover * COST_BPS / 10_000
        both = [nxt[t] / today[t] - 1 for t in today if t in nxt]
        bench = sum(both) / len(both) if both else 0.0
        excess.append(port - bench)
        port_growth *= 1 + port
        bench_growth *= 1 + bench
        held = target
    n = len(excess)
    mean = sum(excess) / n
    var = sum((x - mean) ** 2 for x in excess) / (n - 1) if n > 1 else 0.0
    t_stat = mean / math.sqrt(var / n) if var > 0 else 0.0
    return {"days": n, "trades": trades, "net_return": port_growth - 1,
            "benchmark_return": bench_growth - 1, "t_stat": t_stat}


def evaluate(data: bytes, strategy_path, n_tested: int, timeout: int = 600) -> dict:
    """Full judgement. Only the summary leaves this function."""
    required = threshold(n_tested)
    base = {"n_tested": n_tested, "required_t_stat": round(required, 3)}
    try:
        days = parse(data)
    except DataFailed as e:
        return {**base, "result": "FAIL", "category": "DATA_FAILED", "detail": str(e)}
    try:
        weights = sandbox.run(strategy_path, days, timeout=timeout)
    except sandbox.StrategyFailed as e:
        # e.stderr is deliberately dropped: it could carry sealed data out.
        return {**base, "result": "FAIL", "category": "IMPLEMENTATION_FAILED", "detail": e.reason}
    s = score(days, weights)
    passed = s["t_stat"] > required
    return {**base, **{k: round(v, 4) if isinstance(v, float) else v for k, v in s.items()},
            "result": "PASS" if passed else "FAIL",
            "category": None if passed else "HYPOTHESIS_FAILED"}
