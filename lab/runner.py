"""Runs INSIDE the sandbox. Stdlib only. Never imported by the evaluator.

Protocol (JSON lines): the evaluator sends one trading day at a time,
  {"date": "2024-01-02", "rows": [[ticker, close, volume], ...]}
and this replies with that day's target weights, {"w": {ticker: weight}}.
The strategy only ever sees days that have already been sent, so it cannot
look ahead. It is called as generate_signals(prices), where prices is
{ticker: [(date, close, volume), ...]} up to and including today.
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
        for ticker, close, volume in day["rows"]:
            prices.setdefault(ticker, []).append((day["date"], close, volume))
        w = mod.generate_signals(prices)
        sys.stdout.write(json.dumps({"w": w}) + "\n")
        sys.stdout.flush()


main()
