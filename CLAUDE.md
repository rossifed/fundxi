# fundXI — Project Instructions

## What this is

A trading simulator on World Cup 2026 players. Users buy/sell "shares" of real
players whose value moves with performance, news, injuries, match events.
Robinhood meets Fantasy Premier League.

Status: prototype. Mock data client-side. No backend yet, no auth, no
persistence.

## Strategy

Decided 2026-05-01. We chose the **web-first → backend → native mobile** path
(over going native immediately, or wrapping web in a Capacitor shell).

End-state shape:

- `frontend/` — Vite + React + TS, **desktop-first**, this repo's `src/`. Doubles
  as a prototyping/dev tool now and a potential desktop product later.
- `backend/` — Python + FastAPI + PostgreSQL (TimescaleDB) running locally
  via Docker Compose for v0. Production infra (Hetzner / managed) deferred.
  Same DDD layering as frontend. **Not** a fork of fundy — starts clean,
  3 schemas (`raw` / `core` / `valuation`), no master/staging/marts pipeline.
- `mobile/` — React Native + Expo, comes much later. Reuses `domain/`,
  `application/`, `api/` from frontend via a shared package.

The mobile-native app is the long-term primary target for end users. Web stays
as (a) dev/prototyping environment, (b) potential desktop product later.

Why web-first: fastest iteration (no app stores, hot reload, instant
deploy). The DDD layers are pure TS so they reuse 100% in RN. The only
throwaway when going native is the `ui/` layer.

## UI direction

**Desktop-first with mobile parity as a constraint.** Same pages, same widgets,
same flows on every device. The user must recognize "same app" when switching
desktop ↔ mobile.

- Same 5 tabs (Home, Screener, Fixtures, Portfolio, Leagues), same icons, same
  labels — sidebar on desktop, bottom nav in RN later.
- Same widgets, same order, same hierarchy. **No desktop-only side rails**
  with extras that don't exist on mobile.
- Single column content centered (max ~820px) on desktop, full-width on
  mobile. Whitespace on the sides on desktop is the price of parity (Twitter /
  Bluesky / Spotify pattern).
- No multi-column dashboards.
- Hover states / cursor pointers on desktop are fine — invisible on mobile so
  no parity break.
- Player detail = centered modal on desktop, bottom sheet on mobile (RN).
  Content inside identical.

Visual identity (palette, fonts, surfaces, gradients, animations) is fixed by
the original design and must not drift. See `context/FUNDXI-BRIEF.md` for the
strict rules (3 colors only: green `#48ff43` / red `#ff285d` / white-grey).

## Architecture (DDD)

5 layers, strict unidirectional dependencies. Verified by `tsc`.

```
src/
├── domain/         Entities + domain services. Pure TS, no React, no I/O.
├── application/    Application services. Orchestrate domain + repositories.
├── api/            Public surface for the UI. Stable contract.
├── infrastructure/ Adapters. Today: in-memory mocks. Tomorrow: HTTP fetch.
└── ui/             React presentation. Calls only api/ + domain/ types.
```

Dependency rules:

| Layer            | Imports allowed                                         |
| ---------------- | ------------------------------------------------------- |
| `domain/`        | nothing                                                 |
| `application/`   | `domain/`, `infrastructure/`                            |
| `api/`           | `application/`, `domain/`, `infrastructure/`            |
| `infrastructure/`| `domain/`                                               |
| `ui/`            | `api/`, `domain/` (types only)                          |

Backend wiring plan: `infrastructure/repositories/*.ts` swap their bodies from
in-memory arrays to `fetch('/api/...')`. Same import paths everywhere
upstream → zero changes in `api/`, `application/`, `domain/`, `ui/`.

## Data Sourcing — NON-NEGOTIABLE

**Every value visible in the UI must originate from the provider (today
Sportmonks) and be persisted in our own database before display.** No
exceptions, no placeholders, no synthetic prose, no hardcoded lookup tables
masquerading as data.

Concretely:

1. **No invented content.** Do NOT generate fake skills, fake bios,
   templated prose, or "filler" copy from real fields just to make a section
   look populated. If the data isn't there, the section is hidden — full
   stop. "Wikipedia-style synthesized text" is forbidden.

   **Single allowed exception**: a synthetic placeholder may live in the UI
   *only* when the user has been explicitly told "this is fabricated", has
   explicitly opted in to keeping it, AND a real source has been agreed for
   the future. Track every such placeholder as a debt in the project memory
   file so future sessions know it must be replaced.

2. **No frontend hardcoded mappings of provider data.** A team color, a
   confederation, a position label that is *intended to represent provider
   data* must come from the DB — not from a `team_branding.ts`,
   `position_label.ts`, or any in-frontend dictionary. If the provider
   doesn't give it, the data doesn't exist; we don't invent it.

   The single legitimate exception is **purely presentational mapping** —
   e.g., translating a provider enum code (`FW`) to a UI string ("Forward")
   in a `Record` is acceptable as long as it's clearly localisation, not
   data. When in doubt, ask the user whether to (a) localise in code or (b)
   ingest the provider's `name`/`label` field.

3. **No direct provider calls from the frontend.** All Sportmonks reads go
   through a Python ingestion worker → DB → BFF endpoint → frontend. The
   frontend never knows the provider exists.

4. **Schema decisions are user decisions.** Before adding a column to an
   existing table, a new table, or a new field on a domain object, **ask the
   user where the data should live**. Propose the schema (table, columns,
   indexes, FKs, JSONB blobs for raw payload), wait for confirmation, then
   implement. Don't pollute existing aggregates with unrelated fields and
   don't fragment a single concept across two tables.

5. **`raw` archive is mandatory for any new ingestion.** Provider responses
   land in `raw.sportmonks_event` (idempotent on response_hash) before any
   projection. The DB always carries the source of truth so we can replay or
   debug a projector without re-hitting the provider.

6. **Honesty in audit.** When the user asks "is this real?", trace each
   visible field to its source: column name → table → projector → provider
   include → endpoint. If anything in the chain is synthesized, declare it
   immediately and propose a fix (cache the section behind a real-data
   condition, or add an ingestion path).

Violation of these rules is a stop-the-line bug. Fix before continuing
feature work.

## Engineering Discipline

Beyond layout, every change must respect the following.

**1. DDD vocabulary explicit.** Every new module/class is labelled with its
DDD role in a header comment or PR description: Value Object, Entity,
Aggregate Root, Domain Service, Repository (port), Application Service / Use
Case, DTO, Adapter. If the role is unclear, the design is wrong — stop and
challenge.

**2. Functional-first by default.** Before reaching for a class, ask if a pure
function suffices. Preferences in order:
- pure functions over methods
- immutable data (frozen dataclasses, `readonly` TS, tuples) over mutable
- short composable functions over long procedures
- explicit data flow over hidden state

Classes are reserved for Aggregate Roots, stateful Adapters, things with
genuine identity. Domain Services and Use Cases lean functional whenever
possible.

**3. SOLID — concrete rules, not slogans.**
- **S**: one file, one reason to change.
- **O**: extend by composition (cf. pluggable `ValuationStrategy`), never by
  modifying a stable module.
- **L**: subtypes honor the parent contract — no surprise `NotImplementedError`.
- **I**: small focused interfaces; no god-interface.
- **D**: `domain/` depends on nothing. Adapters depend on the domain, never the
  reverse. Enforced by imports.

**4. KISS.** The simplest design that solves *today's* requirement. No
speculative generality, no preventive abstraction.

**5. DRY but not WET — Rule of Three.** Duplication is acceptable up to two
occurrences. Abstract only on the third. Premature abstraction costs more than
duplication.

**6. Challenge-first protocol.** Before any non-trivial design choice (new
class, new dependency, new layer):
- state the problem in one sentence;
- list 2–3 alternatives;
- justify the choice against the principles above;
- pause for user validation if the impact is durable.

"Quick & dirty" and "we'll refactor later" are forbidden.

**7. Robustness at boundaries.** Explicit error handling at HTTP / DB / I/O
boundaries. No bare `except`, no silent swallow. Inside the domain, trust
invariants.

**8. Tests.** Every Domain Service / Application Service / Use Case has a unit
test before merge. No test, not merged.

## Conventions

- **snake_case** for module files (`player.ts`, `screener_service.ts`).
- **PascalCase** for React component files (`HomePage.tsx`, `Sheet.tsx`).
- **Explicit field names**: `Player.change_24h`, not `Player.ch`. PEP8 spirit.
- All English: code, comments, commits, docs.
- **No emojis in source code.** Mock data may include emojis as content
  (flags, event icons, league avatars).

## Styling & theming — NON-NEGOTIABLE

All colors flow through the **design tokens** system. Never hardcode a hex
value in a component, ever. The system is:

1. **`src/ui/design/theme.css`** — CSS custom properties (`--color-…`)
   organised in `:root` (default dark theme) and `[data-theme="<name>"]`
   override blocks. Single source of truth for what each semantic color
   actually looks like.
2. **`src/ui/design/tokens.ts`** — TypeScript wrappers exposing
   `var(--color-…)` strings for React inline styles
   (`import { color } from "@/ui/design/tokens"` → `color.positive`,
   `color.actionBuy`, etc.).
3. **Components** consume tokens, never literals:
   - ✅ `<span style={{ color: color.positive }}>`
   - ✅ `<span style={{ color: "var(--color-positive)" }}>`
   - ❌ `<span style={{ color: "#216c6e" }}>`
4. **Theme switching** = `document.documentElement.dataset.theme = "ocean"`.
   No JSX changes. No re-bundle. A new theme is just a new
   `[data-theme="<name>"]` block in `theme.css`.

**Rules:**
- Adding a new color → first add the variable in `theme.css`, then the
  matching `color.X` in `tokens.ts`, then use it in the component. Don't
  shortcut by typing a hex.
- Semantic names, not visual: `--color-positive`, not `--color-green`
  (alternate themes may move "positive" to a different hue).
- The only legitimate hex literals in components are **provider data**
  (team kit colors / flag colors coming from Sportmonks), which are
  per-row data, not theme.
- RGBA white/black overlays (`rgba(255,255,255,.04)` for subtle surfaces)
  are theme-agnostic on a dark UI and may stay inline as a transitional
  pattern, but feel free to tokenise them when they have semantic meaning
  (e.g. `--color-surface-2`).

Violation of this rule is a stop-the-line bug. A "change all the X-color
buttons" request must be a 1-line edit in `theme.css`, never a sed across
the repo.

## Stack

**Frontend (current)**: Vite 6 + React 19 + TypeScript 5 strict. npm. Path
alias `@/*` → `src/*`. Dev server on `:5173`.

**Backend (in progress)**: Python 3.12 + FastAPI + PostgreSQL/TimescaleDB
running in Docker Compose locally. uv + ruff + pyright strict + pytest/anyio.
SQLAlchemy 2 async + asyncpg + Alembic. Sportmonks WC2026 All-In as the data
provider. Same DDD layering as frontend. Production infra deferred. Auth: TBD.
See `backend/docs/architecture.md` for the full data-architecture and cost
decisions.

**Mobile (later)**: React Native + Expo. Will require monorepo refactor:
extract `domain/`, `application/`, `api/` into a shared `packages/core`.

## Status

Done

- Frontend DDD scaffold (5 layers, strict typecheck clean).
- 8 pages: Home, Screener, Fixtures, Portfolio, Leagues, Profile, MatchView,
  PlayerSheet.
- 6 reusable UI primitives: Spark, Sheet, PositionBadge, LiveBadge, Donut,
  PerformanceChart, TradeFlow.
- 7 mock repositories: 80 players, 48 teams (national, WC2026), 4 leagues,
  fixtures, lineups, trades.
- Production build clean (~95 KB gzipped).
- Backend M1 — Foundation: Docker Compose (Postgres + TimescaleDB), uv +
  pyproject, Alembic, FastAPI skeleton, 3 empty schemas (`raw`, `core`,
  `valuation`).
- Backend M2 (token-independent half) — Static ingest scaffold:
  domain entities (Team, Player, Fixture + VOs), SQLAlchemy ORM models,
  Alembic migration 0002, repository ports + adapters with PG UPSERT, raw
  event archive (idempotent on response_hash), Sportmonks httpx client,
  pure projector functions, bootstrap Application Service, CLI worker.
  38 unit tests passing, ruff clean, pyright strict clean.

In progress

- Desktop refonte: sidebar layout, modal player sheet.
- Backend M2 E2E — blocked on Sportmonks 14-day trial token to validate
  projectors against real payloads.

Next

- Subscribe to Sportmonks 14-day trial; populate `.env` with
  `SPORTMONKS_API_TOKEN` and `WC2026_SEASON_ID`; run bootstrap E2E.
- Backend M3 — read-only BFF: FastAPI routers for `players`, `teams`,
  `fixtures`. Wire frontend `infrastructure/repositories/*.ts` to
  `fetch(${VITE_API_URL}/api/...)`.
- Backend M4 — live ingest worker (poll `/livescores/inplay` 10–15s during
  active fixtures; write to `core.match_event` / `core.player_match_stat`).

Later

- Backend M5 — valuation engine v0 (XGBasedStrategyV0 + after_insert
  subscriber; produces `valuation.player_price_tick`).
- Backend M6 — WC2022 backfill via Sportmonks for offline replay.
- Auth (TBD provider).
- v1 backend — portfolio/trades/leagues persistence (today client-side mocks).
- React Native mobile app, monorepo extraction.

## Reference files

- `src/ui/shell/App.tsx` — root composition.
- `src/ui/shell/Sidebar.tsx` — desktop nav.
- `src/api/*.ts` — UI contract surface (entry points the UI calls).
- `src/infrastructure/repositories/*.ts` — swap point for backend.
- `context/FUNDXI-BRIEF.md` — original design brief, color rules.
- `context/fundxi-v6.jsx` — original 1700-line prototype (reference only).
- `backend/docs/architecture.md` — backend data-architecture, provider
  choice, API budget, operating costs, pre-sales questions.
- `backend/src/application/bootstrap.py` — Bootstrap Application Service
  (orchestration entry point for static ingest).
- `backend/src/infrastructure/sportmonks/client.py` — Sportmonks HTTP
  adapter (SportmonksClient port + HttpxSportmonksClient impl).
- `backend/alembic/versions/` — DB schema history.
