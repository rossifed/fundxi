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
- `backend/` — Python + FastAPI + PostgreSQL on Hetzner test (cluster
  `pg-financial-hetzner-test`). Same DDD layering as frontend.
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

## Conventions

- **snake_case** for module files (`player.ts`, `screener_service.ts`).
- **PascalCase** for React component files (`HomePage.tsx`, `Sheet.tsx`).
- **Explicit field names**: `Player.change_24h`, not `Player.ch`. PEP8 spirit.
- All English: code, comments, commits, docs.
- Inline styles preserved from the original prototype design (color/layout
  fidelity). Migration to a styling system (vanilla-extract / CSS modules) is
  a future-only consideration, not a current refactor target.
- No emojis in source code. Mock data may include emojis as content (flags,
  event icons, league avatars).

## Stack

**Frontend (current)**: Vite 6 + React 19 + TypeScript 5 strict. npm. Path
alias `@/*` → `src/*`. Dev server on `:5173`.

**Backend (planned)**: Python + FastAPI + PostgreSQL on Hetzner test. Same
DDD layering as frontend. Auth: TBD.

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

In progress

- Desktop refonte: sidebar layout, modal player sheet.

Next

- Backend Python + FastAPI scaffold.
- Schema + Alembic migrations on PostgreSQL Hetzner.
- Wire `infrastructure/repositories/*.ts` to HTTP client (replaces in-memory
  arrays).

Later

- Auth (TBD provider).
- Real data ingestion (player values, fixtures, live match events).
- React Native mobile app, monorepo extraction.

## Reference files

- `src/ui/shell/App.tsx` — root composition.
- `src/ui/shell/Sidebar.tsx` — desktop nav.
- `src/api/*.ts` — UI contract surface (entry points the UI calls).
- `src/infrastructure/repositories/*.ts` — swap point for backend.
- `context/FUNDXI-BRIEF.md` — original design brief, color rules.
- `context/fundxi-v6.jsx` — original 1700-line prototype (reference only).
