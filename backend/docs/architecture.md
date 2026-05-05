# fundXI Backend — Architecture & Operating Costs

*Decisions captured 2026-05-05. Update this doc whenever a load-bearing
decision changes.*

This document records the load-bearing decisions taken for the fundXI backend:
data provider, stack, scope, API budget, operating cost. It is meant as the
quick reference future sessions and contributors come back to before
implementing or refactoring.

---

## 1. Data provider — Sportmonks WC2026 All-In

### Decision

Subscribe to **Sportmonks WC2026 All-In** (€129/mo) when we go live with
ingestion. Use the **14-day free trial** during development (M2 → M5).

### Why this provider

- **Native live xG** — *the* signal that turns naive valuations (price moves
  on goals) into smart ones (price anticipates performance via accumulated
  expected goals).
- **Granular per-player live stats** — passes, duels, dribbles, shots, ratings.
  Feeds the valuation engine event-by-event, not just on goals.
- **Pressure Index** (proprietary) — additional feature for the model without
  paying a second provider.
- **Dedicated WC2026 plan** — we pay for exactly the scope we need (Cup +
  qualifiers), not 2,300 leagues we won't touch.
- **Industrial-grade reliability** — 99.99% uptime, 6.4B calls/month
  processed. Important: API downtime during a match means a frozen market
  for users.

### Alternatives considered and rejected

| Provider | Verdict |
|---|---|
| **API-Football (api-sports.io)** | Cheaper ($19/mo) but **no native xG**; player-level live stats are shallower. Good for a livescore app, weak for a valuation engine — which is fundXI's actual product. |
| **Opta / Stats Perform** | Gold standard (xG, xT, tracking, push streams). But enterprise-only, 4–5 figures/month, sales contract. Reconsider only if fundXI scales to a real B2C product with traction. |
| **StatsBomb open data** | Free but **post-match only**, on selected competitions. Useful for **training/backtesting the valuation model offline** (zero cost) but unusable for live. |
| **Football-Data.org / live-score-api** | Too thin on player-level data. Out of contention. |

### Webhook caveat (open question)

Sportmonks docs and marketing **disagree** on webhook availability for football:
- Their **glossary** explicitly says *"Sportmonks currently delivers football
  data through a reliable pull-based API model"*.
- Their **blog** mentions *"Premium plans offer webhook support for instant
  notifications of match events"*.
- Their **technical docs sitemap** has **zero** webhook page.

**Decision**: assume **REST polling only** for v0 (worst case planning). If
pre-sales confirms webhooks, treat as a bonus.

---

## 2. Backend stack

### Decision

- **Postgres + TimescaleDB** in **local Docker Compose** for v0. Production
  infra (Hetzner / AWS / managed Postgres) deferred.
- **Three schemas**: `raw`, `core`, `valuation`.
- **httpx + tenacity + Python projectors** for ingestion. No DBT, no Sling,
  no Dagster, no dlt.

### Schemas

| Schema | Purpose | Owned by |
|---|---|---|
| `raw` | Sportmonks payload archive (audit + replay) | Workers (idempotent on `(endpoint, response_hash)`) |
| `core` | Provider-agnostic domain model — Team, Player, Fixture, Lineup, MatchEvent, PlayerMatchStat, PlayerXgEvent | Projectors |
| `valuation` | Outputs of the valuation engine — PlayerPriceTick, MatchPlayerChange, PlayerDailySnapshot | Valuation engine |

No `master/staging/intermediate/marts` à la fundy. The fundy 5-layer pattern
is overkill at our scale (single provider, ~1M rows total). Three schemas
is the right answer for v0.

### Tooling rejected (for v0) and why

| Tool fundy uses | Rejected because |
|---|---|
| **DBT** | Designed for warehouse-scale SQL transformations; we have JSON parsing in Python and live-latency requirements. DBT runs in batches — wrong shape for sub-30s ingestion. |
| **Sling** | Designed for SQL→SQL bulk copy; Sportmonks is a REST API with nested JSON. Wrong tool. |
| **Dagster** | Heavy orchestrator. fundXI v0 has 5–6 workers, fine on APScheduler / cron. Reconsider if we go multi-service. |
| **dlt** | Strong for batch ingestion / many sources / quick prototypes. We have one source and live latency needs — dlt would be batch-shaped duplicate of our pipeline; the projection step (the real work) doesn't get faster. Reconsider when we onboard a 2nd provider. |
| **Kafka / RabbitMQ** | Premature. SQLAlchemy after_insert events do the in-process pubsub for the valuation engine. |

### Tooling adopted

- **SQLAlchemy 2.0 async** + **asyncpg** — ORM + driver
- **Alembic** — DDL versioned, including `create_hypertable` for TimescaleDB
- **httpx** — async client for Sportmonks
- **tenacity** — retry/backoff on 429/5xx
- **structlog** — structured logs
- **Pydantic / pydantic-settings** — config from `.env`
- **pytest + anyio** — tests (per Atonra Python conventions)

### DDD layout

Backend mirrors frontend (5-layer DDD). See `backend/CLAUDE.md` (root project)
for the per-layer import rules and the **Engineering Discipline** section
(DDD vocabulary explicit, functional-first, SOLID, KISS, Rule of Three,
Challenge-first, tests mandatory).

---

## 3. v0 scope and WC2022-first strategy

### Decision: build everything on WC2022 first, swap to WC2026 later

The full v0 (M2 → M5: ingestion + valuation engine + read-only BFF) is
built and validated on **WC2022 (Qatar)** historical data, *not* WC2026.
The switch to WC2026 is a single env var change once the tournament starts.

**Why**: WC2022 has 32 teams, 64 matches, complete events / xG / stats —
all available now. We get real data immediately, can calibrate the
valuation engine against known narrative outcomes (Messi's run, Mbappé's
hat-trick in the final, etc.), and de-risk the entire pipeline before
the actual WC2026 kickoff. The active tournament is parameterised via
`ACTIVE_SEASON_ID`.

### Live ingest becomes a swap, not a behavioural change

Both ingestion paths feed the same downstream pipeline:

```
ReplayWorker (WC2022) ──┐
                        ├──▶ EventDispatcher ──▶ ValuationEngine ──▶ valuation.player_price_tick
LiveWorker (WC2026)  ───┘
```

ReplayWorker reads `core.match_event` chronologically (configurable speed:
0× instant, 1× real-time, 60× compressed for demos). LiveWorker polls
`/livescores/inplay`. Same events flow into `core.*`, same valuation
engine reacts, same frontend renders. **Symmetry over special cases.**

### Read-only BFF in v0

**Read-only Sportmonks-fed endpoints** in v0. Portfolio / trades / leagues
remain client-side mocks until v1.

### What v0 covers

- `players_api.list/get/search/top_movers` — backed by `core.player` +
  `valuation.player_price_tick`.
- `teams_api.list/get` — backed by `core.team`.
- `matches_api.list_fixtures / get_match / get_live_match / get_match_feed /
  get_resolved_lineups` — backed by `core.fixture`, `core.lineup`,
  `core.match_event`, `valuation.match_player_change`.
- `valuations_api.get_for_player / get_top_movers` — backed by
  `valuation.*`.

### What v0 does NOT cover

- `portfolio_api.*` — holdings, trades, totals, preview_trade, list_trades.
  Stays in client-side mocks.
- `leagues_api.*` — private leagues, leaderboards. Stays in client-side mocks.
- Auth, users, persistence of trades — v1 chantier.

### Backtest

WC2022 historical backfill **via Sportmonks** (same provider) for replay
and offline calibration of the valuation engine. Cost to confirm with
pre-sales (probably included in WC2026 plan, possibly an add-on).

---

## 4. API call sizing

Pagination assumption: 25 items/page (Sportmonks v3 default).

### Bootstrap M2 — one-shot

| Step | Endpoint | Calls |
|---|---|---|
| Teams | `/teams/seasons/{id}` | 2 |
| Fixtures | `/fixtures/seasons/{id}` | 5 |
| Squads | `/squads/seasons/{id}/teams/{tid}` × 48 | 48 |
| **Total** | | **~55 calls** |

→ ~1.8% of a 3,000/h budget. Re-runnable for free (idempotent on raw archive).

### Daily refresh M2bis

| Step | Calls |
|---|---|
| Fixtures changes | 5 |
| Players updates (filtered by `updated_at`) | 10 |
| Teams (rare) | 0–2 |
| **Total** | **~15–20 calls/day** |

### Live ingest M4 — peak day (4 simultaneous matches × 2h)

| Endpoint | Polling | Calls/day |
|---|---|---|
| `/livescores/inplay` (single global call) | 10s | 720 |
| xG per fixture | 10s × 4 | 2,880 |
| Lineups (T-90, T-15, T-1) | per fixture × 4 | 12 |
| **Total** | | **~3,600/day** |

→ Peak hourly rate **~1,800/h**. Under 3,000/h plans, but **no comfortable
margin**. Mitigation already designed: drop polling to **15s** if needed
(no UX impact) → ~1,200/h.

### Backfill WC2022 M6 — one-shot

64 matches × ~5 endpoints + 32 squads ≈ **~350 calls**, completes in one
hour.

---

## 5. Operating cost

### Sportmonks subscription

| Plan | €/mo | Decision |
|---|---|---|
| WC2026 Advanced (no xG) | 69 | Rejected — xG is the differentiator |
| **WC2026 All-In** | **129** | **Chosen** |
| Pro generic | 249 | Fallback if WC2026 rate limit too tight |

### Total tournament cost

| Phase | Period | Cost |
|---|---|---|
| Backend dev (M2 → M5) | Now → end of May 2026 | €0 (14-day Sportmonks trial) |
| Pre-tournament (test on friendlies) | Early June 2026 | €129 (1 month) |
| Tournament (11 June – 19 July 2026) | June – July 2026 | €129 × 1 ≈ €129 (covered in same month or rolling into July) |
| Post-mortem analysis | August 2026 | €0 (cancel) |
| **Tournament total** | | **~€260** (2 monthly payments) |

### Local infra cost

- Postgres + TimescaleDB in Docker Compose on laptop: **€0**
- Optional small VPS (Hetzner CX22) for demo: **~€5/month**

### Total ceiling

**~€300 max** for the entire tournament window — including a fallback
upgrade to Pro generic if needed. No 4-figure commitments, no enterprise
contracts.

---

## 6. Open questions to ask Sportmonks pre-sales

Send these in a single email before signing. Frame the request as
"real-time valuation engine on top of WC2026" so they take the technical
constraints seriously.

1. **Exact rate limit** on the WC2026 All-In plan (calls per hour). Is it
   per token, per endpoint, or global?
2. Is `/livescores/inplay` (single global call returning all in-play
   fixtures) **counted separately** from per-fixture endpoints?
3. **xG / `/expected-goals`** — counted in the same bucket as the rest, or
   separately?
4. **Pagination default size**: confirm 25 items/page across all the
   endpoints we use.
5. **WC2022 historical access** included in the WC2026 plan, or one-shot
   add-on?
6. **Webhooks**: clarify the contradiction between docs (REST only) and
   blog (Premium webhooks). If available, what events are pushed and on
   which plans?
7. **14-day trial coverage** — does it cover all WC2026 All-In endpoints
   including xG and Pressure Index, or only generic?

---

## 7. Document hygiene

- Update this file when any of the decisions above changes.
- Keep it under ~300 lines so it stays scannable.
- This document is the **single source of truth** for "why this provider /
  this stack / this budget"; resist duplicating its content in commit
  messages or chat logs.
