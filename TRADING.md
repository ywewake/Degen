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

## Sealed exam (Milestones 4–5, built)
```
DEVELOPMENT (AI + strategy)  ──X──  data/sealed/exam.sealed (AES-256-GCM, scrypt key)
                                              │
                                    human types the key at a terminal
                                              ▼
                 preflight ─► exam log (GitHub, append-only) ─► sandboxed strategy ─► judge ─► RESULT
```
| Command | What it does |
|---|---|
| `./exam_log init` | Once: creates the `exam-log` branch on `origin`. Protect it on GitHub right after |
| `./seal_data <file>` | Human only: encrypts the exam, binding it to this exam log. Refuses to replace an existing exam |
| `./preflight <id>` | Runs `strategy.py` on ugly synthetic data in the sandbox. Costs nothing |
| `./evaluate_sealed <id>` | The exam. Once per hypothesis, ever |
| `./exam_log` | Every exam ever taken plus imported history, N, the next threshold, and RECOMMENDED / CONFIRMED status |

What `./evaluate_sealed` does, in order (everything before step 5 can fail without using the exam):
1. Refuses if the evaluator code has uncommitted changes.
2. Checks integrity, then that the final action was `./loop attempt`.
3. Preflight on ugly data: crash, hang, bad weights → IMPLEMENTATION FAILED, nothing used.
4. Asks for the key; wrong key fails. Unusable exam data → DATA FAILED, nothing used.
5. Pushes the exam record to the exam log. Refuses a **retake** (same strategy, prediction or hypothesis text), a log that is **not the one sealed into the exam file**, or a log whose history was **rewritten**. If the push fails, the exam does not run.
6. Runs the strategy in the sandbox and prints only the summary. The result goes to the exam log.

**The judge** (`lab/backtest.py`), fixed rules a prediction cannot change:
- Data: CSV `date,ticker,close,volume`. Bad rows dropped; duplicate (date, ticker) → DATA FAILED.
- The strategy is called as `generate_signals(prices)` once per day and sees only days up to today (it cannot look ahead). `prices = {ticker: [(date, close, volume), ...]}`. It returns `{ticker: weight}`: long-only, sum ≤ 1, only tickers priced today.
- Held to the next close. A stock with no next price is marked at its next available close; if it never trades again, −100%.
- Cost 50 bps per unit turnover. Benchmark: equal-weighted return of all tickers priced on both days.
- PASS if the t-stat of daily (net − benchmark) returns > max(3.0, √(2 ln N)), N = exams in the exam log.

**The sandbox** (`lab/sandbox.py`, bubblewrap): no network, nothing writable, no view of the repo or home directory, 2 GB memory, time limit. No sandbox → nothing runs. The strategy's error output is never shown for sealed runs (it could carry exam data).

**Exam log**: records live on the `exam-log` branch, written with git plumbing (your working tree is never touched). N comes from here, not from the local database, so wiping local files cannot lower it.

### History and the coroner rule
This loop is the sealed-exam room for **H18 onward**. Ideas and H17's forward track stay in the
research system. Two things connect them:

- **Imported history counts toward N.** `degen-judge import-history <file.csv>` adds hypotheses tested
  elsewhere to the exam log, permanently, after you type APPROVE. N = imported + examined here.
  Re-importing an id is refused, so later merges from other ledgers only add. Format:
  ```
  id,title,outcome,t_stat,decided,note
  H9,Overnight gap fade (liquid-only),FAIL,-3.19,2026-10-10,confirmed dead
  H17,Insider cluster buys (forward),PENDING,,,rules frozen at forward/RULES-FROZEN.md
  ```
  `outcome` is PASS, FAIL, INCONCLUSIVE or PENDING; `t_stat` may be empty.
- **Every result is RECOMMENDED until you confirm it.** `degen-judge confirm <id> <CLASSIFICATION>`
  (PASS, HYPOTHESIS_FAILED, IMPLEMENTATION_FAILED or DATA_FAILED) asks for a one-line reason at the
  terminal and records it in the exam log. You may override the evaluator's category. A confirmation
  is final.

### The judge user (the real boundary)
Everything in the workspace is writable by the AI, including the evaluator's own code. So the
sealed side runs as a separate Linux user, `judge`, from its own copy:

| Lives in the judge's home (700: you and the AI can't read or write it) | Lives in your workspace (the judge only reads it) |
|---|---|
| evaluator code, `judge.conf`, sealed exam, `memory/judge.db`, exam-log git memory, the judge's GitHub deploy key | hypotheses, strategy snapshots, `memory/ledger.db` |

You run exams with `sudo -u judge degen-judge ...`; sudo asks for your password, which the AI
doesn't have. Once a `judge` user exists, the workspace's `./seal_data`, `./evaluate_sealed` and
`./exam_log` refuse to run: the AI could have edited them to capture the key.

New evaluator code reaches the judge only through `degen-judge update <branch>`, which shows you the
diff of every evaluator file and needs you to type APPROVE.

### Setup on Windows (WSL2)
1. Install WSL2 with Ubuntu. Clone the repo **inside** WSL (`~/Degen`), not under `/mnt/c`.
2. `sudo apt install python3-cryptography bubblewrap git openssh-client`
3. Make sure your user's sudo **asks for a password** (WSL's default). The setup script refuses if it doesn't.
4. On GitHub: Settings → Branches → add a rule for `exam-log`: block force pushes, block deletions,
   and do not allow bypassing (applies to admins too).
5. Push your workspace, then: `sudo scripts/setup_judge.sh ~/Degen git@github.com:ywewake/degen.git`
   It creates the judge, prints a deploy key for you to add on GitHub (with write access), and clones the judge's copy.
6. In a WSL terminal, never through an AI tool:
   - `sudo -u judge degen-judge init`
   - put the exam CSV somewhere the judge can read, then `sudo -u judge degen-judge seal <file>`; delete the plaintext
   - `sudo -u judge degen-judge evaluate <id>` / `sudo -u judge degen-judge log`

Real-user boundary tests (create and delete system users, so opt-in):
`sudo DEGEN_TEST_USERS=1 python3 -m unittest discover -s tests -p test_judge.py`

Broker: Interactive Brokers paper account, **stub only** (`lab/broker.py`). Live ports (7496/4001) and non-`DU` accounts are refused.

## Not built yet
- Development backtest command (same judge, on `data/development/`, full detail)
- Paper trading, risk engine, `config/TRADING_LOCKED`
- Run hypothesis #1 (a boring one)

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
