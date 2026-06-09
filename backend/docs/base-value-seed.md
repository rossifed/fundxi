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

## Proposed schema (PENDING user confirm before the Alembic migration)

- `core.player.base_value` — `Numeric(8,3)` **nullable**, €M. Comment: "pre-
  tournament Transfermarkt market value snapshot, set once; NULL → price '—',
  never synthetic in prod".
- `raw.transfermarkt_market_value` — scrape archive:
  `tm_player_id (PK) · player_slug · player_name · team_slug · team_verein_id ·
  market_value_m · snapshot_date · source='transfermarkt'`.

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

1. **Prereq — load WC2026 players in `core.player`** (bootstrap ingestion,
   season WC2026). The matching needs targets. *(STATE: to confirm.)*
2. Alembic migration: add `core.player.base_value` + `raw.transfermarkt_market_value`.
3. Scrape (fixed name extraction) → insert into `raw.transfermarkt_market_value`
   with `snapshot_date`.
4. Matching script: our WC2026 players ↔ raw TM, by team + normalized name
   (+ DOB tiebreak) → write `core.player.base_value`. Log the unmatched.
5. Resolve unmatched (manual or `source='derived'` from team avg + age).
6. Engine: read `core.player.base_value` as the prod anchor; NULL → `—`. Keep the
   sim synthetic path (tagged). Remove the synthetic **display** fallback
   (no-tick → `—`, not a synthesized number).

## Open questions (blockers to start coding)

1. Confirm the schema above (column + raw table) → then Alembic.
2. Are WC2026 players already loaded in `core.player`? (step 1 prereq.)

## Compliance notes

- New data source (Transfermarkt) → must keep the raw archive (this table) per
  the project's data-sourcing rule.
- ToS: Transfermarkt has no official API; this is HTML scraping (against their
  ToS). Accepted as a one-shot pragmatic seed; a licensed source (CIES, Football
  Benchmark) would be the clean alternative for a commercial product.
