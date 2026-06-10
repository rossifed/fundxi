# fundXI Backend — Data Model Review

*Reviewed 2026-06-09 from the Alembic migrations (source of truth, 0001→0027)
cross-checked with the SQLAlchemy ORM models and the read/write paths
(queries, repositories, trade execution, valuation provider, leaderboard).
The local Postgres was not queried — the schema is Alembic-managed so the
migrations are authoritative.*

Scope of the ask: (1) is the construction approach sound, (2) constraints &
FKs, (3) indexes vs. access patterns, (4) is it fed correctly, (5)
normalization for our usage, (6) is every column in the right place.

---

## Verdict

The model is **healthy for v0**. The schema separation (`raw`/`core`/
`valuation`/`app`), the idempotent raw archive, explicit FKs with deliberate
`ON DELETE` semantics, composite PKs aligned with hypertable partition keys,
and `numeric` (never float) for money are all correct and above the bar for a
prototype. There is **no structural redesign needed**.

What needs attention is a short list of correctness bugs and consistency
debts. Two are real bugs (P1); the rest are cheap hygiene fixes worth doing
before the data set grows past the tournament squad.

---

## What is done right (keep)

- **Schema layering** `raw` (idempotent archive on `(endpoint, response_hash)`)
  → `core` (provider-agnostic) → `valuation` → `app`. Clean, replayable,
  provider swap survives renaming. The decision to skip the fundy 5-layer
  pattern at this scale is correct.
- **Source-agnostic naming**: provider ids live in `sportmonks_id` mapping
  columns, never as PKs. Schema survives a provider change.
- **FKs are explicit everywhere** with intentional `ON DELETE`: `CASCADE` for
  true children (lineup, match_event, match_comment, holding, trade, ticks),
  `SET NULL` for optional refs (venue, coach, fixture on news/ticks),
  `RESTRICT` for team (can't orphan a fixture/player). Correct.
- **Composite PKs on timeseries** `(player_id, ts)` / `(portfolio_id, ts)` —
  also the hypertable partition key. Range reads are cheap on the PK.
- **`numeric` for all monetary/price values** (never float). Fractional shares
  `numeric(12,4)` is a sound, documented decision.
- **`pricing_progress` singleton** with `CHECK (singleton = 1)` — clean
  watermark pattern, crash-safe.
- **Idempotent UPSERT ingestion** keyed on the stable `sportmonks_id`.

---

## P1 — Correctness bugs (fix before more ingestion)

### P1-A. `updated_at` is never refreshed on UPSERT for core tables
`AuditMixin.updated_at` uses `onupdate=func.now()`, which only fires on
SQLAlchemy unit-of-work UPDATEs. The core entities are written via
`pg_insert(...).on_conflict_do_update(...)`, which **bypasses `onupdate`
entirely**, and none of the core repositories add `updated_at` to the conflict
`set_` payload (verified: `player`, and by the same shape `team`, `fixture`,
`news`, `lineup`, `match_event`). There is no DB trigger either.

Result: `core.*.updated_at` is frozen at first insert and never moves on
re-ingest. Any "what changed since" logic, daily-refresh diffing, or staleness
check on these tables is silently wrong.

Note the stat tables already do it right (`team_match_stat`,
`player_match_stat`, `standings`, `pricing_progress` all set `updated_at` in
the conflict payload) — so the fix is to make the core repos consistent with
them.

**Fix (pick one):**
- add `"updated_at": text("now()")` (or `stmt.excluded.updated_at`) to every
  core `on_conflict_do_update` `set_`, **or**
- a DB trigger `BEFORE UPDATE ... SET updated_at = now()` (covers every write
  path, including future raw SQL). Given the UPSERT pattern is pervasive, the
  trigger is the more robust single fix.

### P1-B. `core.player.age` is redundant with `date_of_birth` and goes stale
`player` carries both `age` (int) and `date_of_birth` (date, added in 0010).
`age` is a volatile derived value — it is wrong the day after any player's
birthday and only refreshes on re-ingest. Storing a computed, time-dependent
value violates normalization (derive, don't store).

The only reason it's a column is the screener's SQL-level age sort
(`player.py:118`). That sort works equally on `date_of_birth` (invert the
direction: older = earlier DOB).

**Fix:** drop `age` as a stored column; derive it at read time from
`date_of_birth`, and sort the screener on `date_of_birth DESC/ASC`. If a
stored `age` must stay for players with no DOB from the provider, document it
as a fallback and recompute on every ingest.

---

## P2 — Consistency debts (schema-level)

### P2-C. Surrogate-key type drift for the same concept
- `app.portfolio.id` = `INTEGER` but `valuation.portfolio_value_snapshot.portfolio_id` = `BIGINT` (FK to it).
- `app.user.id` = `INTEGER` but `app.password_reset.user_id` = `BIGINT` (FK to it).
- Sportmonks ids: `season_id` is `INTEGER` on `fixture` but `BIGINT` on
  `player_tournament_stat`; `sportmonks_id` is `INTEGER` on player/team/fixture
  but `sportmonks_statistic_id` is `BIGINT`.

FKs across int↔bigint work, but it's inconsistent and a latent foot-gun (join
key width mismatch, future migration friction). Pick one width per concept:
`integer` for app entity PKs (user/portfolio counts are tiny), and one
consistent type for Sportmonks ids (their ids do exceed 2^31 in some
endpoints, so `bigint` for *all* sportmonks id columns is the safe uniform
choice).

### P2-D. `group` stored in three places (drift risk)
`team.group`, `fixture.group`, `standings.group` all hold the same fact. A
national team is in exactly one group, so `team.group` is canonical;
`fixture.group` and `standings.group` are denormalizations (the standings one
is documented as deliberate for cheap group-table reads). Acceptable as a
read optimization, but it's three copies that can drift — at minimum document
`team.group` as the source and the other two as derived.

Related: `fixture.group` is `NOT NULL`, but knockout fixtures have no group.
Confirm what is stored for R16→Final rows (empty string is a smell). With
`stage_name`/`round_name` now present (0018), `group` on fixture is largely
redundant with `stage_name` for the group stage.

### P2-E. `team.color` is `NOT NULL` but the derivation model assumes nullable
`derive_team_colors` explicitly says "teams with no kit-palette fixture yet
keep a null colour", and the UI falls back to a neutral surface — but the DDL
(0002) and ORM both declare `color` `NOT NULL`. Either the projector seeds a
placeholder at insert (what value? if hardcoded, that brushes against the
"no invented provider data" rule) or this is a latent insert failure.
Reconcile: make `color` nullable to match the documented "null until derived"
model, and confirm the team projector never invents a color.

(The derivation itself is **compliant** — colour comes from Sportmonks kit
palettes via `pick_accent_color`, never invented. Good.)

### P2-F. Cash numeric width and currency
- `portfolio.cash` = `numeric(12,2)` but `portfolio_value_snapshot.cash` =
  `numeric(14,2)`. Same quantity, two widths. Align to `numeric(14,2)`
  everywhere (a portfolio can in principle exceed 10^10 once positions
  compound).
- **No currency column anywhere.** This is fine — the whole app/valuation
  domain is EUR-only by design (€M) — but per our modeling rule a
  single-currency table must be *documented as such*. Add a one-line note in
  the migration/model header for `cash`, `value`, `price`, `current_price`
  stating the domain is EUR-only so a future multi-currency need is a
  conscious migration, not a silent assumption.

---

## P3 — Indexes vs. access patterns

### P3-G. Redundant indexes on the leading column of a composite PK
A standalone index on the first column of a composite PK is redundant — the PK
B-tree already serves prefix lookups. These cost write throughput for nothing:
- `valuation.player_price_tick` — `ix_..._player_id` (PK is `(player_id, ts)`)
- `valuation.player_daily_snapshot` — `ix_..._player_id` (PK `(player_id, date)`)
- `app.holding` — `ix_app_holding_portfolio_id` (PK `(portfolio_id, player_id)`)
- `core.match_comment_player_mention` — `ix_..._match_comment_id` (PK `(match_comment_id, player_id)`)
- `app.league_member` — `ix_app_league_member_league_id` (PK `(league_id, user_id)`)

**Fix:** drop these five. Keep the *second*-column indexes
(`holding.player_id`, `league_member.user_id`, `mention.player_id`) — those are
genuine reverse-lookup paths.

`portfolio_value_snapshot` has a `(portfolio_id, ts DESC)` index on top of its
`(portfolio_id, ts)` PK — largely redundant (a B-tree scans backward for
`ORDER BY ts DESC`), but harmless; drop only if you want to trim writes.

### P3-H. FK columns missing an index (join / cascade cost)
Postgres does not auto-index FKs. Missing where it matters:
- `core.match_event.related_player_id`, `core.match_event.team_id` —
  `ON DELETE SET NULL`; a player/team delete scans match_event unindexed.
- `core.team.coach_id` — joined on the team page.
- `core.fixture.venue_id` — joined on the match page.
- `core.news.league_id` — minor (rarely filtered).

Low impact at squad scale, but `coach_id`/`venue_id` back real page joins —
add those two at least.

### P3-I. Over-indexing for the data volume
Several single-column indexes on low-cardinality columns at ~700-row scale add
write cost with little read benefit: `fixture.status`, `fixture.group`,
`news.type`, `match_event.type`. Postgres will seq-scan 700 rows faster than
it'll use these. Not urgent, but if you trim writes, these are candidates.

### P3-J. "latest tick per player" is the hot path — fine now, plan for scale
The leaderboard, screener, valuation provider and portfolio history all resolve
"latest price per player" via `DISTINCT ON (player_id) ... ORDER BY player_id,
ts DESC` over `player_price_tick`. On the `(player_id, ts)` PK this is a
backward index scan — fine at tournament volume. At higher tick rates the
DISTINCT-ON over a growing hypertable becomes the bottleneck. The scale answer
(when needed, not now) is a `valuation.last_tick` projection table (one row per
player, last-write-wins) — the fundy `last_metrics` pattern. Note it as a known
future optimization, don't build it for v0.

---

## P4 — Modeling / column placement

### P4-K. `fixture` repeating `home_`/`away_` group (10 paired columns)
`home/away_team_id`, `_score`, `_kit_color`, `_kit_palette`, `_formation` =
five attributes duplicated per side. For exactly-two participants this is a
pragmatic, acceptable shape. But it's at the threshold where a child
`fixture_participant(fixture_id, team_id, is_home, score, kit_color,
kit_palette, formation)` would be cleaner and stop the column count growing
with every new per-team-per-match attribute. Not a v0 change — flag it so the
*next* per-side attribute triggers the refactor instead of an 11th/12th column.

### P4-L. `player_tournament_stat` natural grain not enforced
The intended grain is `(player_id, season_id)`, but the only unique constraint
is on `sportmonks_statistic_id`. `(player_id, season_id)` is indexed, not
unique — two rows for the same player/season are possible if the provider emits
two statistic blocks. Consider a unique on `(player_id, season_id)` if the
domain truly is one-row-per-player-per-season.

### P4-M. `standings` surrogate PK over an already-unique `team_id`
`standings` has a surrogate `id` PK plus `UNIQUE(team_id)`. Since `team_id` is
1:1 with the row, it could be the PK directly. Pure cosmetics — leave it unless
you're tidying.

### P4-N. `raw.sportmonks_event.response` JSONB uncompressed
Fine at ~1M-row total scale. If the archive balloons, TOAST compression or a
retention policy on `ingested_at` is the lever. No action now.

---

## Suggested fix order

1. **P1-A** (`updated_at` trigger or set_ payload) — correctness, touches audit
   on every core table.
2. **P1-B** (drop/derive `age`) — correctness, one-column migration + screener
   sort tweak.
3. **P3-G** (drop 5 redundant indexes) + **P3-H** (add `coach_id`/`venue_id`) —
   one migration, pure win.
4. **P2-C/D/E/F** (type & width alignment, `team.color` nullability, group
   provenance, currency doc) — a consistency-pass migration + header notes.
5. **P4** items — document now, act when the next attribute/scale pressure
   arrives.
