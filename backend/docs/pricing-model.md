# fundXI Pricing Model — Layered v1

Status: spec validated 2026-05-16. Implementation in progress.
Supersedes the events-only v0 (`events_based_v0.py`), which becomes
layer 1 of this model. v0 stays callable for backward compat / tests.

## Goal

A player's price must move **a lot** during a live match (target
~30–50 explainable ticks/player/match) while staying **coherent** —
every tick traceable to real football data, never random jitter.

## Price identity

```
price = base_value × (1 + cumulative_return)
```

`cumulative_return` is updated **incrementally** on every Sportmonks
payload (~10–15s, All-In plan). Latency invariant: each poll computes a
delta from the *diff since the last poll* held in worker state — never a
recompute over history. O(events + changed-stats) per poll, one DB
transaction, then NATS publish. This is already the
`live_pricing_poller` + `LivePricingState` shape; new layers must keep
that shape.

## Layers

Each layer returns a percent delta applied multiplicatively to the
pre-delta price. All coefficients live in
`src/valuation/coefficients.py` (one place to retune, no strategy edit).

### Layer 1 — Discrete events (v0, kept)

Goal/assist/penalty/own-goal/cards. Unchanged from
`events_based_v0.py`. Big discrete jumps (±3–8%). Per-match clamp.

### Layer 2 — Continuous performance (NEW, the core)

Driven by the diff of `core.player_match_stat` running totals between
two polls (the poller already ingests this under
`?include=lineups.statistics`). On the All-In plan `raw_details` JSONB
carries **xG / xA** alongside the typed columns (shots,
shots_on_target, key_passes, passes).

Per poll, for each player whose stat row changed:

```
delta = w_xg_per_0_1      × (Δxg / 0.1)
      + w_xa_per_0_1      × (Δxa / 0.1)
      + w_shot_on_target  × Δshots_on_target
      + w_shot            × Δ(shots_total − shots_on_target)   # off-target shots
      + w_key_pass        × Δkey_passes
clamped to [−max_poll, +max_poll]
```

Small per poll (±0.1–0.6%). It is *not* mean-reverted artificially —
coherence comes from the input being real accumulated production. A
player doing nothing produces Δ=0 → no tick (correct: flat is honest).
A standout trends up tick by tick. This layer alone yields the density
target on the All-In feed.

xG/xA gating: if `raw_details` has no xG (shouldn't happen on All-In,
but defensive), layer 2 degrades to shots/key-passes only — still dense
enough; never invents an xG value.

### Layer 3 — Pressure Index modulator (NEW, All-In only)

Sportmonks Pressure Index scales how "in the action" a team is.
Modulates layers 1+2 for involved players:

```
modulated_delta = delta × clamp(pressure_factor, mod_min, mod_max)
```

Default factor = 1.0 when the Pressure Index is absent for that
instant (no-op, additive). Bounds keep it a modulator, not a driver.

### Layer 4 — Team propagation (NEW)

A team goal (scored / conceded, incl. own-goals & penalties) nudges
**every** player of that team — the floor that guarantees movement even
for players with no individual stat in a payload.

```
scored:   +w_team_goal_for  × pos_mult_for[bucket]
conceded: −w_team_goal_against × pos_mult_against[bucket]
```

Small (±0.3–0.8%) vs the scorer's individual +5%. The scorer stacks
both (scored *and* their team leads — coherent). Position-aware:
conceding hits GK/DEF harder; scoring rewards FWD/MID a touch more.

### Layer 5 — Playing time / bench (NEW)

"Those who play can win; a benched player is not valuable." Bounded
and **reversible** — value recovers if the player starts the next
match. Never a death-spiral (a rested star is still worth a lot).

| Transition | Source signal | Delta |
|---|---|---|
| Not in announced XI | lineup role=bench at lineup-publish (~1h pre-KO) | `w_out_of_xi` (neg, bounded) |
| Starter subbed off | SUBSTITUTION event, related_player_id | `w_subbed_off` (small neg — accrual ends) |
| Sub comes on | SUBSTITUTION event, player_id | `w_subbed_on` (pos — re-enters accrual) |
| Unused sub | bench, no SUBSTITUTION-on by FT | `w_unused_sub` (small neg, applied once at FT) |

The lineup-publish moment becomes a tradeable event (skill: anticipate
the XI). Reversibility is structural: deltas are per-fixture, applied
to the running price; a benched player simply gains less, and starts
accruing again next match — there is no permanent penalty term.

### Layer 6 — News / inter-match (LATER, not in v1)

Injury/suspension reprice + slow decay toward fundamentals between
matches. Deferred.

## Structural fixes folded in

- **base_value anchor** (FIXME in `engine_valuation_provider`): DONE in
  2a. `change_since_inception` now anchors at the tournament-open
  baseline tick (`fixture_id IS NULL`, emitted by `wc_replay`), not the
  first event tick. Falls back to the earliest tick when no baseline
  exists (legacy data).
- **Daily snapshots** are now DERIVED from the deduped tick curve, not a
  second independent event-only replay — they can never disagree with
  the sparkline regardless of which layers produced the ticks.
- **Live clean-game / unused-sub FT bonus**: still 2b. It needs an
  FT / fixture-status trigger (`fundxi.fixture_status`) that is a
  separate mechanism; not folded into the live hot path until then.

## Sequencing

- **2a (DONE)**: spec + pure layer functions (layers 2–5) + unit tests
  + wired layers 4 (team propagation) & 5 (playing-time: subbed
  on/off, unused-sub) into `wc_replay` on **real** event+lineup data;
  base_value anchor fix; snapshots derived from ticks. Layer 2 (stat/
  xG) + layer 3 (pressure) exist as pure, tested functions but are NOT
  yet called by any path (no per-poll stat feed without the token).
- **2b (token active)**: wire layers 2/3 + live team-propagation /
  playing-time / FT bonuses into `live_pricing_poller`; calibrate all
  coefficients against a real in-play payload sample. Coefficients in
  `coefficients.py` are defensible starting points, NOT final.

## Calibration status

Coefficients in `coefficients.py` are defensible defaults, **pending
calibration** on a real Sportmonks All-In in-play sample (token pending
activation, M2 E2E blocker). Do not treat them as validated.
