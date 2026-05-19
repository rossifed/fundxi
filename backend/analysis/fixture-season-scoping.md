# Fixture season scoping (WC2022 + WC2026 coexistence)

Date: 2026-05-19.

## Problem

The WC2026 bootstrap (season 26618) is additive — it does not wipe
WC2022 (18017). Both tournaments' fixtures live in `core.fixture`.
`/api/fixtures` had no season filter → the GUI listed Nov-2022 and
Jun-2026 matches together.

## Fixes

1. **Bootstrap robustness** — `bootstrap_teams` / `bootstrap_fixtures`
   now skip Sportmonks' own `placeholder: true` teams and any
   unprojectable item (TBD knockout slots like "Winner Quarter-final
   1"), mirroring the existing squads/stats skip pattern. Without this
   the WC2026 bootstrap aborted on the first bracket placeholder.

2. **`core.fixture.season_id`** — migration 0022 adds nullable indexed
   `season_id`. `project_fixture` reads it natively from the Sportmonks
   payload (every fixture object carries `season_id`; not invented).
   Carried through entity/ORM/repo upsert. `list_all` / `list_by_status`
   take an optional `season_id`; the fixtures router passes
   `settings.active_season_id` (>0) so the GUI shows one tournament.

## One-off backfill (pre-existing rows)

The 136 rows present before 0022 were backfilled from the raw archive
(faithful, no API calls), then verified 64×18017 + 72×26618:

```sql
WITH archived AS (
  SELECT DISTINCT (it->>'id')::bigint AS smk_id, (it->>'season_id')::int AS season_id
  FROM raw.sportmonks_event e
  CROSS JOIN LATERAL jsonb_array_elements(e.response->'data') it
  WHERE e.endpoint='/fixtures' AND it ? 'season_id'
)
UPDATE core.fixture f SET season_id = a.season_id
FROM archived a WHERE f.sportmonks_id = a.smk_id;
```

Reproducible without this SQL by re-running the bootstrap (project_fixture
now sets season_id natively).

## Open issues (NOT fixed here)

- **Teams / players are not season-scoped.** `core.team` is keyed by ISO
  short_code (a nation is one entity across tournaments); WC2022 (32) +
  WC2026 (48) nations coexist → `/api/teams` returns 54. Players will mix
  similarly once WC2026 squads are published. Scoping these needs a
  season→participants derivation — separate task.
- **WC2026 squads not loaded.** Bootstrap skipped 1133 (rosters not yet
  published ~3 weeks out). Re-run `ACTIVE_SEASON_ID=26618` bootstrap
  closer to the tournament; the live poller needs player id_maps.
