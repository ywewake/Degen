# Research machine (paper trading only)

One job: stop us (human and AI) from fooling ourselves.
**Paper trading only. Never connect a live-money account.**

## The loop
```
IDEA → PREDICTION (frozen) → CODE → ATTEMPT 1 → 2 → 3 → SEALED TEST → PAPER TRADING → HUMAN DECIDES
```

## Commands (Milestones 1–3, built)
| Command | What it does |
|---|---|
| `./new_idea "<title>"` / `./loop new "<title>"` | Creates `research/hypothesis_NNN/` (hypothesis.md, prediction.md, strategy.py) and a ledger entry |
| `./loop freeze <id>` | Freezes hypothesis.md + prediction.md: hash recorded in the ledger, files made read-only. Refuses blank templates and refuses a second freeze |
| `./loop revise <id>` | Opens prediction_v2.md for editing. **Costs one attempt** |
| `./loop attempt <id>` | Snapshots strategy.py to `strategies/hNNN_v<attempt>.py` (read-only, hashed). Max 3, then `NO MORE ATTEMPTS` |
| `./loop ideas` | Human-readable list of every hypothesis |

How the rules are enforced:
- Every command re-hashes frozen predictions and strategy snapshots; any change → `TAMPERING DETECTED`, nothing proceeds.
- The ledger (`memory/ledger.db`, schema in `memory/schema.sql`) is append-only: SQLite triggers reject UPDATE/DELETE, and reject attempt 4 or a skipped attempt number even from raw SQL.

Tests: `python3 -m unittest discover tests`

## Not built yet
4. Sealed data the development process cannot read
5. Sealed evaluator (threshold = max(3.0, sqrt(2 ln N)), N = hypotheses in the ledger)
6. Attack the machine; fix every loophole
7. Run hypothesis #1 (a boring one)

## Layout
| Dir | Purpose | In git |
|---|---|---|
| `research/` | `hypothesis_NNN/` folders | yes |
| `strategies/` | Frozen per-attempt strategy snapshots | yes |
| `backtests/` | Results | yes |
| `journal/` | Every paper-trading decision and its reasoning | yes |
| `memory/` | Ledger schema (the `.db` is ignored) | schema only |
| `config/` | Broker keys, risk limits | templates only |
| `data/` | Historical prices | no |
