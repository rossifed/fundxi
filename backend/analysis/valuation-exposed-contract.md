# Valuation info exposed to the frontend — inventory & how it's computed

State AFTER chantier 1 (single read-model) + chantier 2a (price-based match %).
Goal of this doc: list every valuation value crossing the API boundary, where it
is exposed, and how it is computed — so the contract is explicit and the
internal representation can change without leaking.

## The single read-model (one source for everyone)

`EngineValuationProvider.get_for_players` → `PlayerValuation` VO. Three SQL
queries (latest tick, anchor, fixtured-tick prices). It is THE only place that
computes the valuation numbers; the screener, top-movers, search, the match view
and the per-player valuation endpoint all read from it.

| Field | Meaning | Computation |
|---|---|---|
| `base_value` | tournament-open anchor (€M) | earliest `fixture_id IS NULL` tick, else earliest tick; un-ticked → deterministic `synthesize_valuation().base_value` |
| `current_price` | latest price (€M) | latest tick; un-ticked → `base_value` (flat) |
| `change_since_inception` | % vs base (always a number) | `(current_price / base_value - 1) * 100` |
| `change_avg_per_match` | mean net % per fixture, or `None` | mean of each fixture's `last_price / pre_price - 1` (PRICES) |
| `change_last_match` | most recent fixture's net %, or `None` | that fixture's `last_price / pre_price - 1` (PRICES) |
| `performance_rating` | latest rating | latest tick; un-ticked → 6.5 |

`pre_price` of a fixture = the player's price right before its first tick
(previous fixture's close, or the tournament-open base). `None` for match fields
when the player has no fixtured tick ("no match yet" ≠ 0%).

## "% of a match" — now ONE definition, price-based

Both the read-model (`change_last_match` / `change_avg_per_match`) and the
per-match list endpoint (`in_match_pct`) compute a fixture's net move from
PRICES: `(last_price - pre_price) / pre_price`. Verified equal on live data
(player 311 / fixture 65: 0.67% on both; was 42.12% when compounded).

Because it reads prices, it is INDEPENDENT of how per-tick deltas are stored —
the per-event-vs-cumulative tick question no longer affects any consumer.

## Endpoints exposing valuation (current)

| Endpoint | Valuation fields | Source |
|---|---|---|
| `players/screener-view` | current_price, since_start_pct, last_match_pct, avg_match_pct, rating, pnl | read-model (+ pnl) |
| `players/top-movers`, `players/search`, `valuations/player/{id}` | full `PlayerValuation` VO | read-model |
| `valuations/sparklines` | price series | raw tick prices, resampled |
| `players/{id}/price-history` | ts, price, fixture_id | raw tick prices (no % field) |
| `players/{id}/matches` | in_match_pct (per fixture) | `(post-pre)/pre` PRICES — same definition as the read-model |
| `fixtures/{id}/match` | per-player value, change_last_match | read-model |

Removed in chantier 2a: `change_since_open` from the price-history DTO, and the
raw `player_changes` map from the match view (both were unused on the frontend).

## Residue removed (chantier 2b — done)

`change_since_open` is gone end to end: dropped from the shared writer, the ORM
model, all ~10 producers (live pollers, sim sinks, rehearsal, replay) and their
NATS tick payloads, plus migration 0032 drops the DB column. Verified: ruff +
pyright clean, 408 backend + 134 frontend tests, a live replay rebuild (13702
ticks) succeeds without the column. The live Sportmonks+NATS path was validated
by shape (unit tests) only, not end to end.

## Net result vs the directive ([[backend-owns-semantic-contract]])

- Frontend computes nothing — was already true. ✓
- One upstream place computes each value — ✓ (read-model is now the single source;
  the prior screener-SQL and the raw match-view paths are gone).
- Internal representation swappable without outward impact — ✓ the tick delta
  semantic no longer reaches any consumer (everything derives from prices).
- No leaked raw field — ✓ on the wire; the dead DB column remains (2b).
