# Mobile Auth — Proposed Plan (for validation before coding)

Status: **proposal**. Nothing here is implemented. Mobile auth is the
remaining blocker for trading (PlayerSheet Buy/Sell) and real Leagues
membership. Validate the decisions below before I write any code.

## The problem

The web uses the Atonra **BFF cookie pattern**: login sets an HTTP-only cookie;
the browser attaches it to every `fetch` automatically. React Native `fetch`
has **no shared cookie jar**, so that pattern does not translate. Today the
mobile app reads the demo backend unauthenticated; writes (trade, join league)
are gated.

## Proposed approach — bearer token + secure storage

1. **Backend** issues a signed token (JWT or opaque) from a login endpoint and
   accepts it via `Authorization: Bearer <token>` on protected routes.
2. **Mobile** stores the token in **`expo-secure-store`** (Keychain / Keystore)
   and attaches it to every request.
3. **Web** keeps the cookie BFF unchanged — the backend accepts *either* cookie
   (web) *or* bearer (mobile). One backend, two transports.

### Why this (vs alternatives)

- **OAuth/social provider (Apple/Google sign-in)** — better UX long-term but
  heavier; the provider is still TBD in the plan. Bearer-token-on-our-backend
  is the minimal first step and is provider-agnostic (a social login can mint
  the same token later).
- **Cookie via a native cookie manager** — fragile in RN, fights the platform.

## Backend work (new, behind a decision)

- `POST /api/auth/register` `{ email, password, display_name }` → `{ token, user }`
- `POST /api/auth/login` `{ email, password }` → `{ token, user }`
- `GET /api/auth/me` (Bearer) → `{ user }`  — already exists as `/api/me` for the
  demo user; generalise to read the token.
- Accept `Authorization: Bearer` on the existing protected routes
  (`/api/portfolio`, trades, `/api/leagues/*`) **in addition to** the cookie.
- Token signing secret via env (no hardcoded secret — Atonra rule).

**Open question for you:** do we build our own email/password, or go straight
to a provider (Apple/Google/Clerk/Auth0)? My recommendation: **own
email/password token now** (smallest, unblocks trading), add social later.

## Core (`@fundxi/core`) work

- `infrastructure/api_client.ts`: add an injectable auth-token getter
  (same setter seam as `set_api_base`) so the app supplies the token and
  `core` stays platform-free. Web injects nothing (cookie); mobile injects the
  secure-store token.
- An `auth_api` (`login`, `register`, `me`, `logout`) + an `init_authenticated_
  repositories()` call once a token is present.

## Mobile work

- `expo-secure-store` token store (save on login, read on boot, clear on logout).
- A lightweight `AuthContext` (mirrors the web `useAuth`) exposing
  `status: loading | anonymous | authenticated` + `login/register/logout`.
- A **Login/Register screen** (modal or `app/auth`).
- Ungate: PlayerSheet Buy/Sell → real trade flow (TradeDialog bottom sheet);
  Leagues create/join already call the API — they'll just carry the token.
- On boot: read token → `GET /api/auth/me` → hydrate `init_authenticated_
  repositories()`; on 401 → anonymous.

## Scope estimate (once decided)

- Backend endpoints + token middleware: ~0.5–1 day.
- Core seam + auth_api: ~0.25 day.
- Mobile AuthContext + secure-store + login screen + ungate trading: ~1 day.
- TradeDialog bottom sheet (port of the web dialog): ~0.5 day.

## Decisions needed from you

1. Own email/password token **(recommended)** vs a social/3rd-party provider now?
2. Token format: JWT (stateless) vs opaque + server session table?
3. Do web + mobile share one user table (they should) — confirm.

Once you pick 1–3, I implement backend → core → mobile, then ungate trading.
