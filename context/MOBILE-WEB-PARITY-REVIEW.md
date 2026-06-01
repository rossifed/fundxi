# Mobile ↔ Web Parity Review

> UX/UI reviewer pass — `apps/web` (Vite/React, desktop-first) vs `apps/mobile`
> (Expo/React Native, file-based routing). Goal: catalogue every divergence on
> three axes — **functionality**, **experience**, **style/theme rendering** —
> as the input for the alignment work.
>
> Date: 2026-06-01. Shared layer: `@fundxi/core` (domain/application/api/
> infrastructure) is consumed identically by both apps — divergences live only
> in the `ui/` layer (web) and `app/` + `components/` (mobile).

## TL;DR

The mobile app is a **substantially complete single-column port**: all 5 tabs,
match detail, and the player sheet are real, data-backed, and live (SSE). The
adaptations that *should* differ (sidebar→bottom tabs, modal→bottom sheet,
table→list+chips) are done well and follow the brief.

The gaps that **break parity** and need work, in priority order:

1. **No persistent portfolio bar** on mobile (web has a sticky always-on P&L
   strip). For a trading app this is the single most-felt absence.
2. **Typography drift** — web renders Inter + JetBrains Mono; mobile renders
   the OS system font + SpaceMono. The "same app" recognition relies on the
   mono numerals; they currently look different.
3. **No watchlist surface** on mobile — you can star players but there is
   nowhere to *see* the watchlist (web exposes it in the RightRail).
4. **No team detail screen** (web `TeamPage`); mobile `TeamLink` is a stub, so
   team names are dead ends.
5. **No tactical pitch** in mobile MatchView (web has List + Pitch tabs).
6. **No player tap-through** from the mobile lineup (web rosters open the sheet).

Intentionally deferred on both-by-design (auth + trading) are *consistent gaps*,
not drift — track them but they are not "alignment" work today.

---

## Axis 1 — Functionality

Legend: ✅ present / parity · ⚠️ present but reduced · ❌ absent · 🟰 intentionally
deferred (consistent decision, not drift).

| Capability | Web | Mobile | Verdict |
|---|---|---|---|
| 5 tabs (Home/Screener/Fixtures/Portfolio/Leagues) | sidebar | bottom nav | ✅ same set, same glyph icons, same labels |
| Persistent portfolio bar (value/cash/P&L/return, live) | sticky strip top | **none** | ❌ **parity break** — core trading affordance missing |
| Watchlist toggle (star) | ✅ | ✅ | ✅ |
| Watchlist **view** | RightRail card | **none** | ❌ stars go nowhere visible |
| Live ticker (current match) | RightRail | **none** | ⚠️ acceptable to drop the rail, but the live entry point is lost |
| Top movers (gainers/losers + spark) | ✅ | ✅ | ✅ |
| Market news feed | ✅ | ✅ | ✅ |
| Screener: search / filters / position / price / team | ✅ | ✅ | ✅ full parity |
| Screener: valuation / statistics / personal tabs | ✅ | ✅ | ✅ |
| Screener: sorting | column headers | sort chips | ✅ adapted well |
| Fixtures: calendar / bracket / groups | ✅ | ✅ | ✅ all three views ported |
| Fixtures: status filter (all/live/done/upcoming) | ✅ | ✅ | ✅ |
| Holdings badge on fixture cards | ✅ | ✅ | ✅ |
| Portfolio KPI grid (7 metrics) | ✅ | ✅ | ✅ |
| Portfolio value chart (live) | ✅ | ✅ | ✅ |
| Positions / trade-history tabs | ✅ | ✅ | ✅ |
| Bulk close positions (`ClosePositionsDialog`) | ✅ | ❌ | 🟰 tied to trading defer |
| Exposure / win-loss / by-team / by-position / by-age | ✅ | ✅ | ✅ all analytics cards ported |
| Leagues: board / create / join | ✅ | ✅ | ✅ + native Share sheet (mobile bonus) |
| Match detail: score, stats, lineups, commentary | ✅ | ✅ | ✅ |
| Match detail: tactical pitch view | List + Pitch | List only | ⚠️ Pitch deferred |
| Match detail: tap player → sheet | ✅ | ❌ | ⚠️ lineup is read-only on mobile |
| Player sheet: header/ribbon/chart/position/match-log | ✅ | ✅ | ✅ rich parity (mobile even adds Personal/Skills/Stats sections) |
| Team detail page | `TeamPage` | stub `TeamLink` | ❌ no navigation target |
| Profile screen | `ProfilePage` | ❌ | 🟰 tied to auth defer |
| Trading (buy/sell flow, `TradeDialog`) | ✅ 2-phase | ❌ gated alert | 🟰 deferred until auth lands |
| Auth (login/register/session) | full `AuthContext` | ❌ demo backend | 🟰 deferred |

### Functional gaps that are real alignment work (not deferred-by-design)
- Portfolio bar (#1).
- Watchlist view surface (#3).
- Team detail screen (#4).
- Pitch view (#5).
- Player tap-through in lineup (#6).
- Live-match entry point from Home/anywhere (the RightRail ticker had no mobile home).

---

## Axis 2 — Experience / Interaction

Most experience differences are **legitimate platform adaptations** and are done
correctly. Flagging both the good adaptations (keep) and the gaps (fix).

| Aspect | Web | Mobile | Assessment |
|---|---|---|---|
| Primary nav | sidebar (220px, sticky) | bottom tab bar | ✅ correct platform mapping |
| Player detail | centered modal `Sheet` | gorhom bottom sheet, 92% snap, pan-to-dismiss | ✅ exactly per brief |
| Dense tables | multi-column grid | single column + horizontal stat strip | ✅ good RN pattern |
| Sorting | clickable column headers | horizontal sort chips | ✅ touch-appropriate |
| Filters | collapsible panel | collapsible inline panel | ✅ parity |
| Chart inspection | hover tooltip (date/value/Δ) | **no hover, no scrub** — headline value above | ⚠️ touch can't hover; but no tap/scrub gesture either → loses per-point inspection |
| Refresh | live SSE only | live SSE + pull-to-refresh | ✅ mobile adds native affordance |
| Tactile feedback | n/a | haptics on trade gate | ✅ native polish |
| Price tick feedback | `TickValue` 450ms pulse + caret | `TickValue` ~250ms tint + caret | ⚠️ minor: shorter, less pronounced flash — see Axis 3 |
| Offline state | sidebar `StreamStatus` (green/red) | top `OfflineBanner` (red strip) | ✅ both present, different placement (fine) |
| Deep links | n/a | `fundxi://join/CODE` prefill | ✅ native bonus |
| Lineup → player | clickable | not clickable | ⚠️ interaction parity break |

### Experience notes
- The **portfolio bar absence** is also an experience issue, not just feature:
  on web the P&L is glanceable from every tab; on mobile you must open the
  Portfolio tab. For a trading product the constant number is part of the loop.
- **Chart scrubbing**: the standard RN parity for hover is a long-press/drag
  scrub that moves a crosshair and updates the headline value. Worth adding so
  the chart isn't purely decorative on mobile.

---

## Axis 3 — Style / Theme Rendering

### Color palette — ALIGNED ✅
- Single source of truth: `packages/core/src/design/palette.ts` (`themes.dark`).
- Web `apps/web/src/ui/design/theme.css` mirrors it (by hand — there is a
  `palette_to_css_block` generator but it is not wired into a build/parity
  test yet; comment in `theme.css` says "keep in sync by hand").
- Mobile `apps/mobile/theme/tokens.ts` imports `themes.dark` directly.
- Verified hex-for-hex equal at time of review (actionBuy `#5CF26C`,
  positive `#00805d`, negative `#E41541`, bg `#020406`, brandGreen `#48ff43`,
  gradient stops, etc.). **No color drift today.**

### Typography — DRIFT ❌ (highest-impact rendering gap)
- Web (`apps/web/index.html`, `globals.css`): body = **Inter** (300–900),
  numbers = **JetBrains Mono**.
- Mobile (`app/_layout.tsx` `useFonts`): loads **SpaceMono** only. Body/sans
  text therefore falls back to the **OS system font** (SF Pro on iOS, Roboto
  on Android), and numerals render in **SpaceMono**, not JetBrains Mono.
- Impact: the two apps look like different products up close. The trading
  identity leans on the mono numerals; SpaceMono ≠ JetBrains Mono is the most
  visible mismatch. Fix = bundle Inter + JetBrains Mono in mobile assets and
  set them as the default text/mono faces.

### Theme switching — DRIFT (low impact today) ⚠️
- Web supports runtime theme switching (`data-theme="ocean"` block exists).
- Mobile hardcodes `export const palette = themes.dark` — no switcher, ocean
  unreachable. Fine while there is one shipping theme, but the moment a second
  theme ships on web it won't follow on mobile. The shared `themes` object
  already makes this cheap to wire later.

### Minor token drift ⚠️
- Default border opacity: web `colors.border = rgba(255,255,255,.04)`; mobile
  `border = rgba(255,255,255,.05)` (mobile also keeps a `borderSoft = .04`).
  Sub-perceptible but it is literal drift — pick one.
- Overlay `text`/`surface` opacity ladders match between the two `tokens.ts`.

### Dead/competing style code on mobile (hygiene) ⚠️
- Expo-template leftovers still in the tree and a **competing color source**:
  `constants/Colors.ts`, `components/Themed.tsx`, `useColorScheme(.web).ts`,
  `useClientOnlyValue(.web).ts`, `StyledText.tsx`, `EditScreenInfo.tsx`,
  `PlaceholderScreen.tsx`, `app/modal.tsx`. None are the authoritative palette
  (that's `theme/tokens.ts` → core), but `Colors.ts` is a hex source that
  *could* be imported by mistake. Recommend deleting to remove drift risk and
  confusion.

---

## Proposed alignment backlog (priority order)

**P0 — felt by every user, cheap-ish**
1. Persistent portfolio bar on mobile (sticky under header, or a header summary)
   — reuses `portfolio_api` totals already wired into the Portfolio tab.
2. Typography: bundle Inter + JetBrains Mono, set as default faces.

**P1 — closes obvious dead ends / interaction parity**
3. Watchlist view surface (a section on Home, or a filter/segment in Screener).
4. Team detail screen + wire `TeamLink` (web `TeamPage` as the spec).
5. Player tap-through from MatchView lineup → PlayerSheet.

**P2 — depth / polish**
6. Chart scrub gesture (touch equivalent of hover tooltip) on price/portfolio
   charts.
7. Live-match entry point reachable from Home (replacement for RightRail ticker).
8. Tactical Pitch view in MatchView.

**P3 — hygiene / future-proofing**
9. Delete Expo-template dead code (esp. `constants/Colors.ts`).
10. Align border opacity (.04 vs .05) — single value.
11. Wire theme switching on mobile from the shared `themes` object (only when a
    2nd theme actually ships).
12. Wire a palette parity test (web `theme.css` ↔ core `palette.ts`) so color
    drift can't silently appear.

**Out of scope for "alignment" (deferred-by-design, track separately)**
- Auth (login/register/session) on mobile.
- Trading flow (`TradeDialog`, bulk close) on mobile — gated behind auth.
- Profile screen — tied to auth.

---

## Implementation status (session 2026-06-01, branch `feat/mobile-web-parity`)

All changes typecheck (`npm run tc` clean: core / mobile / web) and the 76
core vitest tests pass.

- **P0.1 Portfolio bar — BUILT but AUTH-GATED (hidden until mobile auth).**
  `components/PortfolioBar.tsx` (live totals via the shared prices stream +
  `portfolio_api.subscribe`), rendered in a custom tab header
  (`app/(tabs)/_layout.tsx` `TabHeader`). **Caught at QA:** `/api/portfolio` is
  auth-gated and mobile has no auth yet (bearer token deferred — see
  `api_client.ts` / MOBILE-MIGRATION-PLAN R7), so the fetch 401s. The bar now
  **fails silently and hides** (returns null) until the portfolio loads, rather
  than show a misleading €0 or throw an unhandled rejection. It will light up
  automatically once mobile auth lands. → P0.1 effectively joins the
  auth-blocked bucket (trading / profile). Also hardened the Portfolio tab's
  `portfolio_api.refresh()/fetch_history` calls with `.catch` (same latent 401).
  - *Known minor:* the header (and thus the bar) mounts per visited tab — dedupe
    via a shared totals hook later if needed.

- **Ambient background — DONE (added after QA feedback).** `components/
  AppBackground.tsx`: base `#020406` + SVG radial gradient (tokens `grad1..4`,
  ellipse 85%×60% at top-right) + faint `wc-bg.jpg` (~7%, the screen-blend
  approximation). Rendered once at the root behind a transparent navigator tree
  (`_layout.tsx` `ThemeProvider` bg transparent + per-screen transparent roots +
  transparent tab header + translucent portfolio bar). This was the main
  "feels mediocre / flat" gap vs web.
- **P0.2 Typography — DONE (needs a dev build to embed).** Bundled Inter
  (400–900) + JetBrains Mono (400–800) as static weights under
  `assets/fonts/`, registered via the `expo-font` config plugin in `app.json`
  (one family each → `fontWeight` keeps working, no per-style refactor).
  `theme/tokens.ts` now exports `sans = "Inter"` / `mono = "JetBrains Mono"`;
  Inter is the global `Text` default in `_layout.tsx`; all local
  `const mono = "SpaceMono"` and inline `"SpaceMono"` were replaced. SpaceMono
  removed. **Fonts embed at the next EAS dev/prebuild** (config-plugin = native);
  Expo Go / web fall back to system until then.
  - *Verified:* `npx expo config --type prebuild` resolves the plugin + paths.
  - *Note:* `AGENTS.md` says Expo v56; the repo is actually on **SDK 54**
    (`expo` 54.0.35). Implemented against the installed v54 APIs/docs.
- **P1.3 Watchlist surface — DONE.** New `lib/watchlist.ts` session store
  (`useSyncExternalStore`) replacing the screener's local `useState` (which was
  lost on tab change). Screener reads/toggles the store; Home shows a
  "Watchlist" section (live prices) when non-empty.
- **P1.4 Team detail screen — DONE.** New `app/team/[team_id].tsx` (header +
  record + squad summary + squad-by-position rows → player sheet + fixtures →
  match). Wired from: group-standings rows (Fixtures → Groups), the player
  sheet team row, and opponent names on team fixtures.
- **P1.5 Lineup tap-through — DONE.** `app/match/[fixture_id].tsx` RosterCard is
  now pressable → opens the player sheet (guarded to universe players).
- **P2.6 Chart scrub — DONE.** `components/PerformanceChart.tsx` gained a touch
  scrub (crosshair + dot + value bubble) — the touch parity for the web hover
  tooltip. Portfolio + player-sheet charts pass a `format_value` (€M).
- **P2.7 Live-match entry — DONE.** Home Match Center shows a live-match card
  (score + LIVE) → match, mirroring the web RightRail ticker.
- **P3.9 Dead code — DONE.** Deleted the Expo-template cluster (`Themed`,
  `EditScreenInfo`, `StyledText`, `useColorScheme(.web)`,
  `useClientOnlyValue(.web)`, `PlaceholderScreen`, `ExternalLink`,
  `constants/Colors.ts`, `app/modal.tsx` + its route). `+not-found.tsx`
  rewritten on plain RN + palette.

### Not done / deferred (with rationale)

- **P2.8 Tactical Pitch view — DEFERRED.** The formation geometry is shared and
  deterministic (`compute_pitch_positions` in core), so it is portable, but the
  web source is ~595 lines of purely-visual SVG (trapezoid projection, FIFA
  markings, depth-scaled tokens). Tuning token sizing/overlap/legibility needs a
  simulator; blind-porting risks a visual-fidelity regression the brief forbids.
  Best done as a focused, device-verified pass.
- **P3.10 Border .04 vs .05 — SKIPPED (deliberate).** The `border`/`borderSoft`
  tokens turned out to be **unused exports**; every border is an inline literal.
  The drift is sub-perceptible and only a repo-wide sed (risky, would touch
  non-border `0.05` values) would change it. Not worth it.
- **P3.11 Mobile theme switching — DEFERRED.** Only meaningful once a 2nd theme
  ships on web; the shared `themes` object makes it cheap when that happens.
- **P3.12 Palette parity test — NOT ADDED (layering).** A test reading
  `apps/web/theme.css` from `packages/core` forces node builtins into core's
  pure src and inverts the DDD dependency direction (core must not know about
  apps). The correct home is a web-side check; deferred until web has a test
  runner or a build-time `theme.css` generator. Current state is in sync
  (verified by hand this session).

### Verification gap

All work is typecheck-clean but **not yet run on a device/simulator** this
session. Visual QA to do on the next dev build: font embedding (P0.2), the
custom tab header layout + safe-area on notched devices (P0.1), and the chart
scrub gesture vs the parent ScrollView (P2.6).
