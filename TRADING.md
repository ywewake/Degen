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

## Sealed exam (Milestone 4, built)
```
DEVELOPMENT (AI + strategy)  ──X──  data/sealed/exam.sealed (AES-256-GCM, scrypt key)
                                              │
                                    human types the key at a terminal
                                              ▼
                                      SEALED EVALUATOR → RESULT
```
| Command | What it does |
|---|---|
| `./seal_data <file>` | Human-only: encrypts the exam to `data/sealed/exam.sealed`. Refuses to replace an existing exam |
| `./evaluate_sealed <id>` | One exam per hypothesis, ever. Refuses until the Milestone 5 scorer exists |

- The key is never stored. It is read only from a terminal (`/dev/tty`); with no terminal, both commands refuse. A test checks the sealed code never reads the environment.
- Wrong key, missing key or altered file → fails before the exam is used up.
- The exam is recorded as taken **before** the strategy sees data; after that, the hypothesis is closed (no new attempts or predictions; enforced by SQLite triggers).
- Development code reads data through `lab/devdata.py`, which only reaches `data/development/`.

Broker: Interactive Brokers paper account, **stub only** (`lab/broker.py`). Live ports (7496/4001) and non-`DU` accounts are refused.

## Not built yet
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
| `config/` | IBKR connection settings, risk limits (never the sealed key) | templates only |
| `data/` | Historical prices | no |
