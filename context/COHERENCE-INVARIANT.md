# Coherence Invariant — single source of truth for every displayed number

> **Rule.** Every numeric value the user sees in the UI (price, position
> value, PnL, portfolio total, league rank) must derive from **one
> canonical function or SQL query**. Zero parallel recomputation. Zero
> divergent cache.

Violating this rule is a **stop-the-line correctness bug**: the same
underlying state would appear as two contradictory numbers on two
different screens (or pre- vs post-trade). The user must be able to
trust the app blindly.

## Why it matters here

The fundXI domain has a fan-out of derived numbers from a small core:
`cash`, `holdings`, `latest_tick.current_price`, `trades`. Every page
shows a re-aggregation. Without the rule, drift is inevitable.

## How the architecture enforces it today

### Backend — one SQL for value, one query for price

- **Player current price** → exactly one source: the latest row of
  `valuation.player_price_tick` for that player. Read via:
  - `EngineValuationProvider._latest_tick` (used by `/api/players/{id}`),
  - the `latest_tick` CTE in `players.py` screener SQL (used by
    `/api/players/screener-view`),
  - the `latest_tick` CTE in `_LEADERBOARD_SQL` (used by
    `/api/leagues/{id}`).
  All three are identical SELECT DISTINCT ON (player_id) ... ORDER BY
  player_id, ts DESC. Verified by `tests/integration/test_coherence.py`.
- **Portfolio value** → exactly one formula: `cash + sum(shares ×
  latest_price)`. Implemented by `_LEADERBOARD_SQL` for the league
  leaderboard and by `compute_portfolio_totals` on the frontend.
  Both compute the same arithmetic on the same raw inputs.
- **Trade execution** → exactly one path: `execute_trade` mutates
  cash + holding + appends a Trade row in one transaction. Tests:
  `tests/unit/test_trade_execution.py` (logic + invariants),
  `tests/integration/test_trade_db.py` (real DB persistence).

### Frontend — one function per derived metric

- `compute_portfolio_totals(holdings, prices_map, cash)` is the SOLE
  computation of `total_value`, `pnl`, `return_pct`. Every UI surface
  (`PortfolioBar`, `PortfolioPage`, `HomePage`, `TradeDialog`) reads
  this via `portfolio_service.get_my_totals()`. **No shadow logic.**
  Grep-verified: no `total_value = ` recomputation lives in `src/ui/`.
- `simulate_trade()` (frontend preview) and `execute_trade()` (backend
  execution) must agree on every observable number for the same input
  — see `backend/analysis/trade-parity.md` for the canonical cases.
- `EngineValuationProvider` is the single read-path for valuation; UI
  components never bypass it.

## What this guarantees

- A trade lands → cash, holding, position market_value, portfolio
  total, league rank all reflect the new state on the next read
  (no stale cache anywhere on the backend; the SQL is evaluated each
  time).
- A price tick lands → backend `/api/players/*` and `/api/leagues/*`
  return the new value immediately. The frontend reflects it on the
  next refresh (live SSE refresh covers prices and the screener;
  league refresh-on-tick is documented as the remaining live gap and
  closed by a single `useLiveRefetch` call on the LeaguesPage).
- Two surfaces showing the "same" number cannot disagree, by
  construction (they call the same function).

## What it does NOT guarantee (acknowledged limits)

- **Frontend cache freshness across price ticks** — if a UI surface
  doesn't subscribe to the price-tick SSE, it can show a stale
  `total_value` until the next manual refresh. The fix is to wire the
  SSE re-fetch (already done on Screener; add on LeaguesPage).
- **Cross-stack runtime parity** — the frontend preview formula and
  the backend execution formula agree by spec-derived literal tests
  on both sides, but no test runs both in the same process and
  asserts byte-equality of the response. Noted as deferred hardening
  in `backend/analysis/trade-parity.md`.

## Test coverage protecting the rule

| Surface | Test |
|---|---|
| Player price single source across 3 paths | `test_coherence.py::test_cross_source_coherence` (invariant 1) |
| League value == hand-computed portfolio value | `test_coherence.py::test_cross_source_coherence` (invariant 2) |
| Trade execution + cost averaging + residue zero on full close | `test_trade_execution.py` (17 tests, unit + property-based) |
| Trade execution against real Postgres | `test_trade_db.py` |
| Pricing kernel + reconciliation across metric paths | `test_pricing_kernel.py` (33 unit) + `test_pricing_kernel_properties.py` (11 hypothesis property tests) |
| Frontend trade math + 0.1-quantum invariants | `trade_calc.test.ts` (21) + `trade_calc.properties.test.ts` (10 fast-check) |
| Frontend single-source for total_value | grep-verified: no recomputation outside `compute_portfolio_totals` |

## Procedure when adding a new UI metric

1. Identify the canonical formula on the backend (an SQL query) or in
   the domain (a pure function).
2. If the metric doesn't have one yet, **add one** — do not compute it
   inline in a router or a React component.
3. Wire the UI to call that single function. No reformulation.
4. Add a coherence test if the metric appears on multiple surfaces.

Violation of this rule should be caught in code review before merge.
