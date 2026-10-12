"""Runs INSIDE the sandbox. Stdlib only. Never imported by the evaluator.

Protocol (JSON lines): the evaluator sends one trading day at a time,
  {"date": "2024-01-02", "rows": [[ticker, open, close, volume], ...]}
and this replies with that day's target weights, {"w": {ticker: weight}}.
The strategy only ever sees days that have already been sent, so it cannot
look ahead. It is called as generate_signals(prices), where prices is
{ticker: [(date, open, close, volume), ...]} up to and including today.
Weights returned after today's close are executed at the next day's open.
"""

import importlib.util
import json
import sys


def main():
    spec = importlib.util.spec_from_file_location("strategy", "/sandbox/strategy.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    prices = {}
    for line in sys.stdin:
        day = json.loads(line)
        for ticker, op, close, volume in day["rows"]:
            prices.setdefault(ticker, []).append((day["date"], op, close, volume))
        w = mod.generate_signals(prices)
        sys.stdout.write(json.dumps({"w": w}) + "\n")
        sys.stdout.flush()


main()
