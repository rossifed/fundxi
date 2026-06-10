# BaseValue seed — Transfermarkt market values (WC2026)

> Decided 2026-06-09. How we replace the **synthetic** player `base_value` with
> a **real** pre-tournament market value, for the World Cup 2026 universe.
> Read alongside `context/FUNDXI-VALUATION-MODEL.md` (§3.2 BaseValue) and
> `backend/docs/pricing-model.md`.

## Why

Price model = `Price = BaseValue × Multiplier(t)`.

- **Multiplier** is driven by the **Sportmonks live player rating** (per minute
  during a match). In prod this is already real (inplay poller → SQLAlchemy
  `valuation.player_price_tick`); in sim it comes from the replay. The read side
  (`EngineValuationProvider`) is source-agnostic — swap sim↔prod is already done.
- **BaseValue** = the player's **pre-tournament market consensus** ("what
  Transfermarkt would price him at kickoff"), **set once, never modified**.
  **Sportmonks does NOT provide a player market value** (confirmed in the
  valuation-model provider comparison). So BaseValue needs its own source.

Today BaseValue is a deterministic **synthetic** SHA256 seed
(`synthesize_valuation`) — the tracked rehearsal debt. We keep that **for the
simulation/replay only** (we have no historical base to replay), but in **prod**
the real Transfermarkt value must take over.

Hard rule (user, non-negotiable): **no synthetic/invented value in prod display.**
Either we have the value (real) or we compute it from real data, otherwise we
show `—`/N/A. Never hardcode or attach a wrong value.

## Decisions

1. **`base_value` lives directly on `core.player`** (a column). The player IS the
   tradable asset.
2. **Source = Transfermarkt**, scraped once per team (snapshot). Prices being a
   few days off kickoff is irrelevant — we freeze the snapshot.
3. The scrape lands in a **raw/seed table** first (archive + auditable +
   re-runnable), then a **matching** step writes `core.player.base_value`.
4. **Matching is anchored on OUR player list** (Sportmonks-fed, authoritative):
   for each of our WC2026 players, find their value in the scraped TM squad of
   **their team**, by **normalized name (+ date-of-birth tiebreak)**. TM-only
   players (not in our DB) are ignored. There is **no shared id** between
   Sportmonks and Transfermarkt — the join is name-based, but easy within a
   ~25-player team.
5. **Unmatched players** → `base_value = NULL` → UI shows `—`. If the unmatched
   tail is small: fill by hand, or **derive** `base_value = f(team avg value,
   age)` tagged `source='derived'` (a real computation, not invented). Never
   guess a TM value onto the wrong player.
6. **Engine wiring**: in prod, the price anchor reads `core.player.base_value`
   (replacing `synthesize_valuation`). NULL base → no valuation → `—`. The
   **sim/replay keeps its synthetic path**, tagged `source='synthetic'`/
   `'rehearsal'`, for test fixtures.

## Schema (IMPLEMENTED — migration 0031, 2026-06-10)

Decided Option A (anchor as an intrinsic attribute of the player instrument, not a
valuation output): `base_value` is the player's starting price (t0), read with the
player; the valuation at t = base_value × cumulative multiplier of all ticks since.

- `core.player.base_value` — `Numeric(8,3)` **nullable**, €M (pre-tournament TM
  starting price, set once; NULL → price '—', never synthetic in prod).
- `core.player.base_value_source` — `String(16)` nullable (`'transfermarkt'` |
  `'derived'`; never `'synthetic'` in prod).
- `raw.transfermarkt_market_value` — scrape archive: `tm_player_id (PK) ·
  player_slug · player_name · team_slug · team_name (English, the team bridge) ·
  team_verein_id · market_value_m · currency='EUR' · snapshot_date · ingested_at`.

## Scrape recipe (validated 2026-06-09)

- Browser UA (`Mozilla/5.0 … Firefox/128.0`), `Accept-Language: en` → values in
  English format `€{X}m` / `€{X}k`.
- **Throttle: 2s between requests, sequential** (never burst — avoids detection;
  TM has been scraped this way without issue).
- Index (team list): `GET /weltmeisterschaft/teilnehmer/pokalwettbewerb/FIWC`
  → team links `href="/{slug}/startseite/verein/{verein_id}"`.
  (NB: the `…/startseite/pokalwettbewerb/FIWC` tab returns a cookie-consent shell
  with no teams — use the **teilnehmer** tab.)
- Per team: `GET /{slug}/startseite/verein/{verein_id}` carries the **whole squad
  + market values** (no per-player fetch needed). Extract:
  - value: regex `marktwertverlauf/spieler/(\d+)"[^>]*>€([\d.,]+)([mk]?)`
    → €M (`k` ⇒ /1000).
  - player id/name: link `/{player-slug}/profil/spieler/{tm_id}`.
- ~1 request per team. The participants list returns **73 teams** (includes
  non-finalists / qualification tree — harmless, we only match our DB teams).

### Result of the first run (`/tmp/tm_wc2026.json`, transient — regenerate)

73 teams, **1876 players** with values, 0 empty teams. Range €0.025m–€200m,
median €3.5m. Spot-checked correct: Yamal €200m, Mbappé/France €180m, Vinicius
€140m, Bellingham €130m, J. Álvarez €100m.

**Known scraper fix for the real run:** name extraction had a buggy fallback (a
few players showed the *team* slug, e.g. "frankreich"). Fix = key on `tm_id`
(reliable, from the `marktwertverlauf` link) and take the name from the
**player's own `profil/spieler` slug**, not the anchor text / team slug.

## Work sequence

1. **Prereq — load WC2026 players in `core.player`** — DONE 2026-06-10. Re-ran the
   26618 bootstrap; 48/48 WC2026 teams now have squads (1234 players for the season,
   1745 total). NB: overlapping nations carry WC2022∪WC2026 (upsert never deletes),
   so our universe holds ~365 stale players — they fall out of matching naturally.
2. Alembic migration — DONE (`0031_player_base_value_and_transfermarkt`).
3. Scrape — DONE. `seed_transfermarkt` worker → 1877 players / 73 teams into
   `raw.transfermarkt_market_value` (snapshot 2026-06-10). Name extraction keyed on
   the `marktwertverlauf` slug + `profil` anchor text (the first-run team-slug bug is
   gone). Spot-checks correct (Yamal/Haaland €200m, Mbappé €180m).
4. Matching — DONE. `base_value_seed.match_players` (pure, 8 unit tests) + the
   `seed_base_value` worker. **1224 matched** (source `transfermarkt`), 365 unmatched
   (mostly stale players + a few genuine name ambiguities like the two Brazil
   "Danilo"). All 48 teams bridged (English team-name + 6 explicit aliases). **Zero
   wrong matches** — the matcher accepts only a unique in-team hit; homonyms
   (Jurriën≠Quinten Timber, Pau≠Ferran Torres) stay NULL.
5. Resolve unmatched (manual or `source='derived'` from team avg + age) — PENDING
   (optional; the 365 NULLs currently render '—').
6. Engine wiring — PENDING (decision needed, see below). Reuse the existing
   `seed_baseline_ticks` mechanism, fed from `core.player.base_value` instead of the
   synthetic `load_initial_price_state`, so the whole coherence chain derives from the
   real anchor by construction. Then flip the EngineValuationProvider no-tick fallback
   from `synthesize_valuation` to a '—' valuation for NULL base_value. Keep the sim
   synthetic baseline path intact.

## Open questions

1. ~~Confirm schema~~ → done (Option A, migration 0031).
2. ~~WC2026 players loaded?~~ → done (re-bootstrap).
3. **Step 6 wiring (open):** (a) where the shared baseline-seeding/anchor-ts logic
   should live so prod can reuse it without `infrastructure → simulation` coupling
   (reuse-as-is vs extract to a neutral module); (b) whether to flip the synthetic
   display fallback to '—' now (user-visible, interacts with the rehearsal debt and
   the WC2026 opener on 2026-06-11).

## Prod replay (fresh database, no re-scrape)

The validated dev result is **frozen as committed JSONL seeds**, keyed on the
portable `sportmonks_id` / `tm_player_id` (never `core.player.id`, which differs
across databases). Prod applies the result; it does NOT re-scrape Transfermarkt or
re-run the matcher. Chosen 2026-06-10 ("freeze the output").

**Seed files (`backend/seeds/`):**
- `transfermarkt_market_value.jsonl` (1877 rows) — the one-shot TM scrape (raw
  archive). Reloaded for audit / source-of-truth; never re-scraped.
- `player_base_value.jsonl` (1238 rows) — resolved `(sportmonks_id, base_value,
  source)`. Bakes in ALL reconciliation (name matching, the 8 overrides,
  romanisation, the 2 manual fills) by a stable key.
- `player_name_corrections.jsonl` (2 rows) — `{sportmonks_id, name}` for players
  Sportmonks corrupted at source (Casemiro, Mwene). Needed because a prod bootstrap
  re-introduces the corruption from the live API.

**Generator (dev):** `export_base_value_seed` — DB → the two large JSONL files.
Re-run after refreshing the TM snapshot or changing the matcher. The matcher
(`application/base_value_seed.py`) stays the documented generator; prod never runs it.

**Applier (prod):** `apply_base_value_seed` — reads the seeds and writes by
`sportmonks_id` / `tm_player_id`. Idempotent; warns on any seed `sportmonks_id` not
present in `core.player`.

**Prod runbook:**
```
uv run alembic upgrade head
ACTIVE_SEASON_ID=26618 uv run python -m src.infrastructure.workers.bootstrap   # Sportmonks live (squads + fixtures)
uv run python -m src.infrastructure.workers.apply_base_value_seed              # TM raw + name fix + base_value
uv run python -m src.infrastructure.workers.seed_baseline_price_ticks          # anchor tick @ base_value (before opener)
```
The last step writes one ``fixture_id IS NULL`` tick per seeded player at
``current_price = base_value`` (WC2026 open), so the read model's "% since inception"
anchors on the real t0 instead of the first in-match tick. Idempotent; run once after
fixtures are loaded.

**Engine wiring (already in code, no step):** the displayed price, the live in-play
poller, and the trade server-price all read ``core.player.base_value`` via the
``StartingPriceProvider`` port (``DbOrSyntheticStartingPriceProvider`` in prod — real
value where seeded, synthetic only for the un-seeded tail until the "—" path lands).
A seeded player with no tick shows its real price flat at 0%; an unpriceable player's
trade is rejected (``NoServerPriceError``). The sim/replay keeps the synthetic path.
This is immune to Sportmonks roster/name drift for `base_value` (keyed by
sportmonks_id, independent of the name). Caveat: if Sportmonks corrupts NEW names by
cutover time, extend `player_name_corrections.jsonl` accordingly.

## Compliance notes

- New data source (Transfermarkt) → must keep the raw archive (this table) per
  the project's data-sourcing rule.
- ToS: Transfermarkt has no official API; this is HTML scraping (against their
  ToS). Accepted as a one-shot pragmatic seed; a licensed source (CIES, Football
  Benchmark) would be the clean alternative for a commercial product.
