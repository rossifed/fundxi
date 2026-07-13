# Player-stats sanitization audit — prod (Railway), 2026-07-13

Measured on `pg-fundxi-railway-prod`, season WC2026 (26618). Trigger: Embolo
(player 918) second-yellow red vs Argentina (fixture 133333) invisible on the
player page.

## Root causes found (3 independent defects)

### 1. Projector mapping bug — Sportmonks type 85 dropped

Sportmonks encodes cards as three statistic types: 83 = straight red,
84 = yellow, **85 = yellow-red (second yellow → sending-off)**. Both stat
projectors map red from type 83 only:

- `backend/src/infrastructure/sportmonks/projectors/player_stat.py` (`_STAT_RED_CARDS = 83`)
- `backend/src/infrastructure/sportmonks/projectors/player_match_stat.py` (`_CODE_RED_CARDS = 83`)

Embolo raw payloads (stored in `raw_stats` / `raw_details`) carry `84=1, 85=1`;
projected rows say `yellow=1, red=0/null`.

### 2. Event ingestion is upsert-only — duplicates and phantoms accumulate

`core.match_event` is keyed on `sportmonks_id`. During live coverage Sportmonks
emits provisional events (often `player_id NULL`), then replaces them under NEW
ids, and deletes VAR-rescinded events. Our upsert never deletes, so we keep:

- **Attributed duplicates** (same fixture/player/type/minute, different sm ids):
  Cornelius 2×yellow 9' (fx 43), Paredes 2×yellow 90' (fx 19), Almirón 2×yellow
  52'/53' (fx 7), Lasheen 2×yellow 17' (fx 50), Al-Amin 2×yellow 32' (fx 43),
  Harry Kane 2×penalty_missed 10' (fx 22), 1 goal fuzzy pair.
- **Unattributed placeholder floods** (`player_id NULL`): yellow ×11 at 63'
  (fx 46), ×5 (fx 46 71', fx 80085 80'), ×4 (fx 7 10'); VAR ×26 (fx 18 9',
  Chaïbi), ×8 (fx 39 55'). Totals: 29 excess yellow rows, 41 excess var rows,
  6 subs, 1 penalty_missed, 1 other.
- **Phantom goals** — 3 finished fixtures where goal-ish events ≠ final score
  (one extra each): fx 37 Austria–Jordan (a VAR-rescinded Arnautovic goal kept),
  fx 69 and fx 104767 (stale unattributed "Field Goal" placeholders).
- Same failure mode as the tracked VAR-disallowed-goal debt.

Impact beyond display: `apply_suspensions` counts yellow accumulation from
these events → duplicated yellows can wrongly suspend a player.

### 3. Per-event gaps exist in the other direction

Zaid Tahseen: Sportmonks season stat says 1 yellow, zero events on our side
(no zero-event fixture in the season, so a single event was missed/removed).

## Cross-source truth table (cards, season 26618)

11 players diverge between `player_tournament_stat` and event-derived counts.
Explained: type-85 bug (Embolo, Madibo, Al-Amin, Sulaka…), event duplicates
(Cornelius, Paredes, Lasheen, Almirón, Al-Dawsari), VAR-rescinded yellow kept
(Paredes 69' fx 133333 — var event 71'), missed event (Tahseen).

## Goals/assists

- Arnautovic: SM 2 goals vs 3 goal events (one VAR-rescinded phantom).
- Khoukhi (fx 4, 90' header, assist Al-Amin): event + score agree it is REAL,
  yet `player_tournament_stat.goals` is NULL → the Sportmonks season aggregate
  itself has gaps. Neither source is unilaterally trustworthy; score is the
  arbiter for goals.

## SM-internal coherence (sum of player_match_stat vs player_tournament_stat)

1038 players compared: goals mismatch 2, yellow mismatch 4, minutes mismatch 91
(ET-minutes conventions / missing match rows — not investigated further).

## Decisions (validated with user 2026-07-13)

A. Fix projector mapping: red = 83 + 85 (both projectors). Raw must project true.
B. Full-set event reconciliation per fixture (poller + final whistle pass):
   provider payload replaces our event set — upsert present, delete absent.
   Kills duplicates, phantoms, fills gaps. Foundation for everything else.
C. Single-source discipline counts from reconciled events for: tournament stats
   strip, per-match stats panel, screener. Live during matches, always equal to
   the displayed timeline. Non-event stats (passes, duels, minutes, rating) stay
   on Sportmonks stats.
   CONVENTION (revised 2026-07-13, user decision — match Google): a second
   yellow counts as BOTH cards. yellow = yellow_card + yellow_red_card;
   red = red_card + yellow_red_card ⇒ a 2nd-yellow sending-off displays
   2 yellows + 1 red (migration 0045; timeline glyph 🟨🟥). For reference,
   ESPN/Opta's per-match player line for the same match shows the final
   sanction only (Embolo Y=0 R=1) — conventions genuinely differ across
   platforms; Google is the product reference.
D. Sanitization pass on prod: re-sync events for finished fixtures from
   provider, re-project player_match_stat from stored raw_details.
