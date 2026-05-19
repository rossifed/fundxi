# Valuation coherence — the three displayed metrics

Date: 2026-05-19. Trigger: the three numbers shown per player
(current price, per-match change, total change) must move together and
reconcile against one another, derived from a single price series.

## Canonical series

`valuation.player_price_tick.current_price`, ordered by `ts` per player.

- A **baseline tick** anchors every player at their pre-tournament
  value: `fixture_id IS NULL`, `current_price = base_value`,
  `change_since_open = 0.0`, `ts = earliest kickoff − 1 day` (the SAME
  formula `wc_replay` uses, so the two seeders dedupe instead of
  producing two anchors). One per player, idempotent on `(player_id,
  ts)`.
- Every impactful match event appends one tick with the compounded
  `current_price` and that event's `change_since_open` delta.

## Invariant (target)

Let `b` = base_value (the NULL-fixture anchor tick's price), `p` =
latest `current_price`, `δᵢ` the per-event deltas.

1. `p ≈ b · Π(1 + δᵢ/100)`            (price is the compounded series)
2. `total% = (p / b − 1) · 100`        (exact vs p and b, by definition)
3. `last_match% = Π_lastfixture(1 + δ/100) − 1` (close-vs-open of the
   most recent fixture; the NULL anchor is excluded by `fixture_id IS
   NOT NULL`)

So `b · (1 + total%/100) = p`, and for a single replayed fixture
`total% ≈ last_match%`. Reconciliation between the delta-compounded
metrics and the price-compounded `p` is exact up to **2-decimal
rounding** applied independently to prices (€, 2dp) and deltas (%, 2dp);
documented tolerance, not a divergence.

## Breakages fixed (2026-05-19)

1. **No baseline tick from the simulator sink.** `price_tick_sink.py`
   only writes on MATCH_EVENT, so `_base_anchor_price` fell back to the
   first *post-event* tick → total understated in every CLI/Streamlit
   replay. Fix: `replay.py` seeds idempotent baseline ticks before the
   replay loop (mirrors `wc_replay`).
2. **`change_24h` was a misnamed duplicate** of last-match in the
   screener path (`COALESCE(lm.net_pct,0.0) AS change_24h`, same `lm`
   as `last_match_pct`). Semantic decision (user, 2026-05-19): keep
   **per-match + total only, drop 24h**. Fix: removed from SQL, DTO,
   API response, frontend type and Screener column.
3. **Screener total used the earliest tick, not the NULL anchor** —
   inconsistent with `EngineValuationProvider`. Fix: screener anchor =
   earliest `fixture_id IS NULL` tick, fallback earliest overall;
   `since_start_pct = (current_price / anchor − 1) · 100`.

## Out of scope (noted)

- `player_daily_snapshot.change_24h` — a genuine daily open/close
  aggregate, correctly named in its own table; not one of the three
  displayed metrics. Left as is.
- Exact (sub-cent) reconciliation between delta-compounding and
  price-compounding (#2 rounding) — bounded tolerance accepted; revisit
  only if a downstream consumer needs cent-exactness.
