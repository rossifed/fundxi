# Trade parity invariant — frontend preview ↔ backend execution

The trade math lives in two implementations in two languages:

- **Frontend** `src/domain/portfolio/trade_calc.ts` — `simulate_trade()`
  shows the user the preview (shares, amount, cash-after, realized PnL).
- **Backend** `backend/src/application/trade_execution.py` — `execute_trade()`
  is what actually mutates the portfolio when `POST /api/trades` fires.

These must agree on every observable number. If they diverge, the user
sees one number in the preview and a different one in their portfolio
after the trade lands — a stop-the-line correctness bug.

## How parity is guaranteed (without a cross-stack runtime test)

1. **Both sides are tested against the same spec-derived literal
   values.** Not against each other (which would be circular) and not
   against the implementation (which would be biased).
2. **Canonical parity cases** (below) appear, with identical inputs and
   identical literal outputs, in BOTH test suites. If either side
   regresses, its suite fails — the comparison is made at the spec
   level, asserted twice.
3. Both suites have property-based fuzzing (fast-check on the frontend,
   hypothesis on the backend) on round-trip and conservation
   invariants — random inputs against the same invariants on both
   sides further constrains them to agree.

## Canonical parity cases (must match on both sides)

| Input | Frontend asserts (trade_calc.test.ts) | Backend asserts (test_trade_execution.py) |
|---|---|---|
| buy 4 shares at price 5.0, cash 100 → | `compute_quantity_from_shares(4, 5).amount === 20`; `compute_cash_after("buy", 100, 20) === 80` | `execute_trade(BUY, 4, 5.0)` ⇒ `cash == 80.0, holding.shares == 4.0, holding.avg == 5.0, trade.total == 20.0` |
| sell 4 shares at price 5.0 of a held 4 @ 5 → | `compute_cash_after("sell", 80, 20) === 100`; `compute_shares_after("sell", 4, 4) === 0` | round-trip: position deleted, `cash == 100.0` exactly |
| weighted avg: prev 3 @ 7.10 + buy 7 @ 7.20 → | (existing literal in trade_calc.test.ts comments) | `_compute_new_avg(...) == 7.17` (literal in test_avg_rounded_to_two_decimals_after_weighting) |
| buy 1000 @ 10 with only 100 cash → | `compute_buy_shortfall("buy", 10000, 100) → { insufficient: true, shortfall: 9900 }` | `execute_trade` raises `TradeError("insufficient cash")`, zero DB mutation |

Any change to ONE of these numbers without the matching change to the
other side breaks parity → the side that wasn't updated FAILS its
literal test → discoverable in CI on the next commit.

## What this DOES guarantee

- The math each side computes for the same input is identical, today
  and on every future change (otherwise the literal tests fail).
- The 2-decimal rounding rule, the cost-averaging formula, the
  cash-conservation rule, the shortfall semantics — all share one
  authoritative literal answer.

## What it does NOT guarantee (next steps)

- Runtime parity (the actual `POST /api/trades` response matches what
  the frontend computed) — that requires a true cross-stack test. Not
  built; could be a single end-to-end test that runs the frontend
  preview function and the BFF response against the same inputs and
  asserts equality. Open for future hardening.
- Schema parity of the response DTO (the field names returned by
  `POST /api/trades` match what the frontend reads). Currently
  enforced only by handwritten DTOs on both sides — a contract test
  would prevent drift.

These two gaps are noted as deferred and out of scope for this
parity-by-spec hardening.
