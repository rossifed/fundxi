# fundXI — Native Mobile Migration Plan

Bring fundXI to native iOS + Android while keeping the **same backend**, the
**same visual identity**, and **functional parity** with the desktop web app —
adapted to a simple, intuitive mobile UX.

Optimised for: clean, robust, fast, and **mechanically replicable with no bad
surprises**. The strategy is to prove the hard parts once on a thin vertical
slice, then repeat a known recipe.

---

## 1. Non-negotiables

- **Backend untouched.** Mobile calls the same BFF endpoints (`/api/players`,
  `/api/portfolio`, …) and the same SSE stream. Zero backend change.
- **Data sourcing rules still apply.** No invented content, no hardcoded
  provider data, all values from the DB. (See root `CLAUDE.md`.)
- **Design tokens stay the single source of truth.** No hardcoded hex in
  components — the token system is ported, not bypassed.
- **DDD layering preserved.** `domain → application → api / infrastructure`
  stays pure TS; `ui` is the only platform-specific layer.

## 2. Decision log (stack)

| Choice | Decision | Why |
|---|---|---|
| Mobile framework | **Expo + React Native** | Team is React; `domain/application/api/infrastructure` reuse 100%. Capacitor = web in disguise (rejected in `CLAUDE.md`); pure Swift/Kotlin = 0% reuse. |
| Monorepo tool | **npm workspaces** | `CLAUDE.md` mandates npm for the frontend. Expo supports npm workspaces. |
| Navigation | **Expo Router** | File-based, native bottom tabs + native stack. |
| Bottom sheets | **@gorhom/bottom-sheet** | Player/Match detail = bottom sheet on mobile (per brief). |
| Styling | **react-native-unistyles** (to confirm at Phase 1) | Replays the `[data-theme]` model: theme switch = data change, not JSX. |
| Charts | **react-native-svg** | `Spark` is already hand-drawn SVG → near 1:1 port. `recharts` is web-only (depends on `react-dom`) and cannot ship to mobile. |
| Live updates | **react-native-sse** polyfill | RN has no native `EventSource`; swapped behind `stream_client.ts` only. |
| Builds / OTA | **EAS Build + EAS Submit + EAS Update** | Cloud builds, store submission, JS-only OTA patches. |

> Exact package versions and CLI syntax are confirmed against official docs at
> execution time — entries above are decisions, not verified specs.

## 3. Target repository structure

```
fundxi/
├── packages/
│   └── core/                  @fundxi/core — pure TS, shared web + mobile
│       └── src/
│           ├── domain/        (moved from src/domain)
│           ├── application/   (moved from src/application)
│           ├── api/           (moved from src/api)
│           ├── infrastructure/(moved from src/infrastructure)
│           └── design/        palette.ts — raw token values (single source)
├── apps/
│   ├── web/                   the current Vite app — only the ui/ layer
│   │   ├── src/ui/ src/main.tsx index.html public/ vite.config.ts
│   └── mobile/                new Expo app
│       └── src/ui/ app/ (expo-router) metro.config.js app.json
├── backend/                   unchanged
└── context/
```

Reuse map (confirmed by code survey):

| Layer | Fate | Notes |
|---|---|---|
| `domain` `application` `api` `infrastructure` | **Moved to `core`, 0 logic change** | Pure TS, no React/DOM imports. ~25% of FE code. |
| `ui/components` `ui/hooks` `ui/helpers` | Logic kept, presentation rewritten in RN | ~35% |
| `ui/pages` + overlays + `ui/shell` | Rewritten mobile-first in RN | ~6.6k lines |
| `recharts` | Dropped on mobile | Replaced by `react-native-svg` |

---

## Phase 0 — Monorepo extraction

Mechanical. **Web behaviour must be byte-identical after this phase.** Highest
leverage, lowest risk — do it first.

**Precondition:** clean working tree. The in-flight `close_positions` /
`ClosePositionsDialog` work must be committed or stashed first (do not bury
unrelated changes inside the restructure).

1. Root `package.json` → `"workspaces": ["packages/*", "apps/*"]`, private.
2. `git mv` `src/{domain,application,api,infrastructure}` → `packages/core/src/`.
   `git mv` preserves history.
3. `packages/core/package.json` — name `@fundxi/core`, `"type": "module"`,
   subpath `exports`: `./domain`, `./application`, `./api`, `./infrastructure`.
4. `packages/core/tsconfig.json` — strict, no DOM lib needed for non-infra; keep
   `DOM` lib only where `fetch`/`EventSource` types are referenced.
5. `git mv` `src/ui`, `src/main.tsx`, `index.html`, `public/`, `vite.config.ts`
   → `apps/web/`. Per-app `tsconfig.json`.
6. Rewrite imports in `apps/web/src/ui`: cross-layer `@/api|@/domain|`
   `@/application|@/infrastructure` → `@fundxi/core/*`. Intra-ui `@/ui/...`
   stays (alias `@/*` → `apps/web/src` still resolves it). Scoped, mechanical.
7. Move FE unit tests with `core` (`screener_service`, `valuation_service`,
   `close_positions`, …); they stay on `vitest`.
8. Scripts: root delegates to workspaces; `apps/web` keeps `dev/build/tc/test`.

**Gate 0:** `npm install` at root · `npm run build -w apps/web` passes ·
`tsc` clean · `vitest` green · `npm run dev` renders the app unchanged.

---

## Phase 1 — Expo scaffold + vertical slice (Home)

One screen, end-to-end, hitting **every** friction point before they multiply.

1. Scaffold `apps/mobile` (latest Expo SDK supporting React 19 / RN 0.79+).
2. **Metro monorepo config** (known gotcha): `watchFolders` → `packages/core`,
   `nodeModulesPaths` for hoisted deps. Verify `@fundxi/core` resolves.
3. Expo Router shell: 5 native bottom tabs (Home, Screener, Fixtures,
   Portfolio, Leagues) — icons + labels identical to the web sidebar.
4. **Tokens port:** `packages/core/src/design/palette.ts` holds the 23 semantic
   token names with raw values per theme — the real single source. Web
   `theme.css` derives from it; mobile builds unistyles themes from it. A
   parity test asserts web ⇄ mobile cannot drift.
5. Implement **Home** fully: featured matches, news, movers, watchlist.
6. Port `Spark` to `react-native-svg` (SVG element names map 1:1).
7. Wire one SSE topic (`matches`) via `react-native-sse` behind `stream_client`.
8. One bottom sheet: tapping a player opens `@gorhom/bottom-sheet`.

**Gate 1:** Home runs on iOS simulator + Android emulator · a live tick is
visible · tokens applied · visually recognisable as the same app as web Home.

---

## Phase 2 — Shared primitives & charts

Port the reusable layer once; pages in Phase 3 then compose known parts.

- Badges/atoms: `PositionBadge`, `LiveBadge`, `Avatar`, `PlayerChip`,
  `SectionHeader`, `TickValue`, `TeamLink`.
- `Sheet` → `@gorhom/bottom-sheet` wrapper.
- `Donut` + `PerformanceChart` → reimplement on `react-native-svg`
  (pie + area; ~1–2 days). Pure chart data-prep helpers go to `core`.
- `PlayerCard` (composes the above).

**Gate 2:** each primitive rendered in an isolated demo screen, token-correct.

## Phase 3 — Page port (mass)

Repeatable recipe now that primitives + one page pattern exist.

- Tabs: `Screener`, `Fixtures`, `Portfolio`, `Leagues`, `Profile`.
- Overlays: `MatchView`, `TeamPage`, `PlayerSheet` → pushed screens / sheets.
- `TradeDialog` → bottom sheet.
- Dense tables (Screener, Fixtures table view) → `FlatList` cards. Functional
  parity: yes. Pixel-identical: no, and intentionally so (single-column brief).

**Gate 3:** all 5 tabs + 3 overlays navigable; trade flow works end-to-end.

## Phase 4 — Live + native polish

- All SSE topics (`fixture/{id}`, `player/{id}`, `prices`, `news`, `standings`).
- Haptics on trade confirm, pull-to-refresh, safe-area insets, status bar.
- Deep links: `fundxi://join/CODE` replaces the web `?join=` param.
- Connection/offline banner (reuse the web connection-status pattern).

## Phase 5 — Distribution

- App icons + splash, store metadata.
- EAS Build → EAS Submit (Apple Developer 99 USD/yr · Google Play 25 USD once).
- EAS Update for JS-only OTA patches.

---

## 4. Risk register (bad surprises, pre-empted)

| # | Risk | Mitigation |
|---|---|---|
| R1 | Metro doesn't resolve workspace packages | Configure `watchFolders` + `nodeModulesPaths` in `metro.config.js` (Phase 1, step 2). |
| R2 | Monorepo move silently breaks the web build | Gate 0: web `build` + `tsc` + tests must pass before Phase 0 is "done". |
| R3 | `recharts` pulled into shared `core` | Charts render only in per-app `ui`; only pure data-prep helpers live in `core`. |
| R4 | Token values drift web ⇄ mobile | Single source `palette.ts`; parity test fails the build on mismatch. |
| R5 | `react-native-sse` behaves unlike browser `EventSource` | `stream_client.ts` is the single seam; polyfill swapped only in the mobile infra binding. |
| R6 | React 19 / RN version mismatch | Pin to an Expo SDK that officially supports React 19; confirm at scaffold. |
| R7 | **BFF cookie auth doesn't translate to RN** | Browser sends HTTP-only cookies automatically; RN `fetch` has no shared cookie jar. Mobile needs a token store (`expo-secure-store`). See open decisions — auth is TBD anyway. |

## 5. Open decisions

- **Mobile auth strategy.** The Atonra BFF pattern (HTTP-only cookies) is
  browser-centric. Mobile likely needs bearer tokens in `expo-secure-store`.
  Non-blocking today (proto has no auth), but decide before wiring auth.
- **Charts library.** Hand-rolled `react-native-svg` (one mental model, matches
  existing `Spark`) vs `victory-native` (less code, heavier dep). Lean toward
  hand-rolled given charts are simple.
- **Styling library.** Confirm `react-native-unistyles` v3 vs alternatives at
  Phase 1 start.

## 6. Status

- [ ] Phase 0 — Monorepo extraction
- [ ] Phase 1 — Expo scaffold + Home slice
- [ ] Phase 2 — Shared primitives & charts
- [ ] Phase 3 — Page port
- [ ] Phase 4 — Live + native polish
- [ ] Phase 5 — Distribution
