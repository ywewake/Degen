"""The judge. Trusted code: parses prices, runs the sandboxed strategy, scores it.

Per-hypothesis terms, frozen in prediction.md before any test (see `terms`):
    Cost round trip: 2%
    Minimum trades: 100
    Newey-West lag: 20

Fixed rules:
  * Data: CSV with header date,ticker,open,close,volume (date as YYYY-MM-DD),
    plus optional event,deal_price. Rows with a bad date or a missing or
    non-positive open/close are dropped. A duplicate (date, ticker) makes the
    dataset unusable (DATA_FAILED).
  * Events go on a ticker's LAST row: `takeover` (deal_price required) or
    `delisted` (a failure). The strategy never sees them.
  * After each close the strategy returns long-only weights (sum <= 1) using
    only data up to that close. They are executed at the NEXT day's open, and
    only for stocks that trade that day. A stock that isn't trading can't be
    bought or sold; it stays held.
  * Endings for a held stock after its last row: a documented takeover exits
    at the deal price; anything else is -100% (delisted, or UNEXPLAINED: in
    micro-caps an unexplained disappearance is more often a failure). A halt
    that reopens within the data is not an ending: the position stays held
    and is marked when the stock trades again.
  * Cost: half the frozen round-trip cost per unit of weight traded.
  * Benchmark: equal-weighted close-to-close return of every stock trading on
    both days.
  * Statistic: Newey-West t-stat (frozen lag) of daily (net - benchmark).
  * PASS: t-stat > max(3.0, sqrt(2 ln N)) AND mean daily net return > 0.
    INCONCLUSIVE: fewer trades than the frozen minimum, or 0 < t-stat <= bar.
    FAIL otherwise. N = hypotheses ever examined, including imported history.
"""

import csv
import io
import math
import re
from datetime import date as Date

from . import sandbox

EVENTS = ("takeover", "delisted")
TERM_LINES = {
    "cost round trip": "Cost round trip: 2%",
    "minimum trades": "Minimum trades: 100",
    "newey-west lag": "Newey-West lag: 20",
}


class DataFailed(Exception):
    pass


class TermsMissing(Exception):
    pass


def threshold(n_tested: int) -> float:
    return max(3.0, math.sqrt(2 * math.log(max(n_tested, 1))))


def terms(prediction: str) -> dict:
    """The frozen per-hypothesis terms, read from the prediction text."""
    found = {}
    for line in prediction.splitlines():
        m = re.match(r"\s*(cost round trip|minimum trades|newey-west lag)\s*:\s*(.+?)\s*$", line, re.I)
        if m:
            key = m.group(1).lower()
            if key in found:
                raise TermsMissing(f"'{m.group(1)}' appears twice in the prediction")
            found[key] = m.group(2)
    missing = [TERM_LINES[k] for k in TERM_LINES if k not in found]
    if missing:
        raise TermsMissing("the prediction must state these terms (example values):\n    "
                           + "\n    ".join(missing))
    try:
        cost = float(found["cost round trip"].rstrip("%").strip()) / 100
        min_trades = int(found["minimum trades"])
        lag = int(found["newey-west lag"])
    except ValueError:
        raise TermsMissing("cost must be a percentage, minimum trades and lag whole numbers") from None
    if not 0 <= cost < 0.5 or min_trades < 1 or lag < 0:
        raise TermsMissing("cost must be 0-50%, minimum trades >= 1, lag >= 0")
    return {"cost_round_trip": cost, "min_trades": min_trades, "nw_lag": lag}


def parse(data: bytes) -> tuple[list, dict]:
    """CSV bytes -> (days, endings).

    days    = [(date, [[ticker, open, close, volume], ...]), ...] sorted by date
    endings = {ticker: (event, deal_price)} from each ticker's last row
    """
    try:
        reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
    except UnicodeDecodeError:
        raise DataFailed("not UTF-8 text") from None
    if not reader.fieldnames or not {"date", "ticker", "open", "close", "volume"} <= set(reader.fieldnames):
        raise DataFailed("header must include date,ticker,open,close,volume")
    by_date, seen, events = {}, set(), {}
    for r in reader:
        try:
            d = Date.fromisoformat((r["date"] or "").strip()).isoformat()
            op, close = float(r["open"]), float(r["close"])
        except (ValueError, TypeError):
            continue
        ticker = (r["ticker"] or "").strip()
        if not ticker or not all(math.isfinite(x) and x > 0 for x in (op, close)):
            continue
        try:
            volume = float(r["volume"])
            volume = volume if math.isfinite(volume) and volume >= 0 else 0.0
        except (ValueError, TypeError):
            volume = 0.0
        if (d, ticker) in seen:
            raise DataFailed("duplicate row for one (date, ticker)")
        seen.add((d, ticker))
        by_date.setdefault(d, []).append([ticker, op, close, volume])
        event = (r.get("event") or "").strip().lower()
        if event:
            if event not in EVENTS:
                raise DataFailed(f"unknown event (must be one of {', '.join(EVENTS)})")
            deal = None
            if event == "takeover":
                try:
                    deal = float(r.get("deal_price") or "")
                except ValueError:
                    deal = None
                if deal is None or not math.isfinite(deal) or deal <= 0:
                    raise DataFailed("a takeover needs a positive deal_price")
            if ticker in events:
                raise DataFailed("a ticker has more than one event")
            events[ticker] = (d, event, deal)
    if len(by_date) < 2:
        raise DataFailed("fewer than two trading days")
    last_date = {}
    for d in sorted(by_date):
        for row in by_date[d]:
            last_date[row[0]] = d
    endings = {}
    for t, (d, event, deal) in events.items():
        if last_date[t] != d:
            raise DataFailed("an event must be on the ticker's last row")
        endings[t] = (event, deal)
    return [(d, sorted(by_date[d])) for d in sorted(by_date)], endings


def newey_west_t(x: list[float], lag: int) -> float:
    n = len(x)
    if n < 2:
        return 0.0
    m = sum(x) / n
    d = [v - m for v in x]
    lrv = sum(v * v for v in d) / n
    for k in range(1, min(lag, n - 1) + 1):
        gamma = sum(d[i] * d[i - k] for i in range(k, n)) / n
        lrv += 2 * (1 - k / (lag + 1)) * gamma
    return m / math.sqrt(lrv / n) if lrv > 0 else 0.0


def score(days: list, weights: list[dict], endings: dict, cost_round_trip: float, nw_lag: int) -> dict:
    opens = [{t: o for t, o, _, _ in rows} for _, rows in days]
    closes = [{t: c for t, _, c, _ in rows} for _, rows in days]
    last_idx = {}
    for i, c in enumerate(closes):
        for t in c:
            last_idx[t] = i
    one_way = cost_round_trip / 2
    pos, last_close = {}, dict(closes[0])
    net, excess, trades = [], [], 0
    exits = {"takeover": 0, "delisted": 0, "unexplained": 0}
    for i in range(1, len(days)):
        o, c = opens[i], closes[i]
        r = 0.0
        # 1. Stocks that stopped trading before today: settle them.
        for t in [t for t in pos if last_idx[t] < i]:
            event, deal = endings.get(t, ("unexplained", None))
            if event == "takeover":
                r += pos[t] * (deal / last_close[t] - 1)
            else:
                r += pos[t] * -1.0
            exits[event] += 1
            del pos[t]
        # 2. Overnight: held positions move from last close to today's open.
        for t, w in pos.items():
            if t in o:
                r += w * (o[t] / last_close[t] - 1)
        # 3. Execute yesterday's target at today's open, for stocks trading today.
        target = weights[i - 1]
        stuck = {t: w for t, w in pos.items() if t not in o}
        new = dict(stuck)
        for t, w in target.items():
            if t in o:
                new[t] = w
        room = 1.0 - sum(stuck.values())
        traded_sum = sum(w for t, w in new.items() if t not in stuck)
        if traded_sum > room > 0:
            new = {t: (w if t in stuck else w * room / traded_sum) for t, w in new.items()}
        elif room <= 0:
            new = dict(stuck)
        turnover = sum(abs(new.get(t, 0) - pos.get(t, 0)) for t in set(new) | set(pos) if t in o)
        trades += sum(1 for t in new if t not in pos and new[t] > 0)
        pos = {t: w for t, w in new.items() if w > 0}
        r -= turnover * one_way
        # 4. Intraday: open to close.
        for t, w in pos.items():
            if t in c:
                r += w * (c[t] / o[t] - 1)
        both = [c[t] / closes[i - 1][t] - 1 for t in c if t in closes[i - 1]]
        bench = sum(both) / len(both) if both else 0.0
        last_close.update(c)
        net.append(r)
        excess.append(r - bench)
    growth = bench_growth = 1.0
    for r, e in zip(net, excess):
        growth *= 1 + r
        bench_growth *= 1 + (r - e)
    return {"days": len(net), "trades": trades, "net_return": growth - 1,
            "benchmark_return": bench_growth - 1, "mean_daily_net": sum(net) / len(net),
            "t_stat": newey_west_t(excess, nw_lag),
            "takeover_exits": exits["takeover"], "delisted_exits": exits["delisted"],
            "unexplained_exits": exits["unexplained"]}


def evaluate(data: bytes, strategy_path, n_tested: int, terms: dict, timeout: int = 600) -> dict:
    """Full judgement. Only the summary leaves this function."""
    required = threshold(n_tested)
    base = {"n_tested": n_tested, "required_t_stat": round(required, 3), **terms}
    try:
        days, endings = parse(data)
    except DataFailed as e:
        return {**base, "result": "FAIL", "category": "DATA_FAILED", "detail": str(e)}
    try:
        weights = sandbox.run(strategy_path, days, timeout=timeout)
    except sandbox.StrategyFailed as e:
        # e.stderr is deliberately dropped: it could carry sealed data out.
        return {**base, "result": "FAIL", "category": "IMPLEMENTATION_FAILED", "detail": e.reason}
    s = score(days, weights, endings, terms["cost_round_trip"], terms["nw_lag"])
    t = s["t_stat"]
    if s["trades"] < terms["min_trades"]:
        result, category, detail = "INCONCLUSIVE", None, f"{s['trades']} trades, minimum {terms['min_trades']}"
    elif t > required and s["mean_daily_net"] > 0:
        result, category, detail = "PASS", None, None
    elif 0 < t <= required:
        result, category, detail = "INCONCLUSIVE", None, "positive but under the bar"
    else:
        result, category = "FAIL", "HYPOTHESIS_FAILED"
        detail = "beat the bar but lost money after costs" if t > required else None
    out = {**base, **{k: round(v, 6) if isinstance(v, float) else v for k, v in s.items()},
           "result": result, "category": category}
    return {**out, "detail": detail} if detail else out
