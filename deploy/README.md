# fundXI — Production deployment (Railway)

Pragmatic prototype prod. **Not** the Atonra K8s/ArgoCD stack — chosen for
speed and low cost (see project memory `prod-deadline-2026-06-10`).

## Architecture

One Docker image (`/Dockerfile`, built from the repo root) runs two roles:

| Railway service | What it is | Start command |
|---|---|---|
| **api** | FastAPI serving the API **and** the web SPA (same origin → cookie auth needs no CORS/SameSite tuning). Runs migrations on boot. | image default `CMD` |
| **worker** | Streaming worker (NATS → SSE) for live prices. Same image. | `uvicorn src.streaming.workers.app:app --host 0.0.0.0 --port ${PORT:-8000}` |
| **ingest** | Live ingest daemon — polls Sportmonks `inplay` during real matches, writes events + price ticks, publishes to NATS. Same image. Drives the live prices. | `python -m src.ingest.workers.main` |
| **nats** | Message bus. Public image, internal networking only. | image `nats:2.10-alpine` |
| **Postgres** | Railway **managed** Postgres (plain PG — fundXI no longer requires TimescaleDB; the hypertable migrations skip gracefully when the extension is absent). | — |

The data flow for live prices: **ingest** (Sportmonks → events/ticks → NATS) →
**worker** (NATS → SSE) → browser. All three of ingest/worker/nats are
internal except worker's SSE endpoint.

The web build is baked into the image with `VITE_API_URL=""` (the SPA calls the
API on its own origin) and `VITE_STREAM_URL=https://<stream-domain>` (the
separate worker origin). These are **build args** — set them in the api
service's build settings.

## Steps

1. **Domain** — buy one (Cloudflare/Namecheap). Needed for HTTPS + Resend
   verified sender + clean reset links.
2. **Railway project** — connect this GitHub repo. Railway builds from the root
   `Dockerfile`.
3. **Postgres** — add the managed Postgres plugin. Reference its URL into the
   api service as `DATABASE_URL`, rewriting the scheme to `postgresql+asyncpg://`.
4. **nats service** — new service from image `nats:2.10-alpine`, args
   `--http_port 8222`. No public domain; use Railway private networking.
5. **api service** — from the repo Dockerfile. Build args: `VITE_API_URL=` (empty),
   `VITE_STREAM_URL=https://<stream-domain>`. Env vars: see
   `backend/.env.prod.example` (APP_ENV, JWT_SECRET, INITIAL_CASH, Sportmonks,
   CORS_ALLOW_ORIGINS, RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL). Attach the
   app domain (e.g. `app.<domain>` or apex).
6. **worker service** — same repo/image, override start command (table above).
   Env: `STREAM_NATS_SERVERS=nats://<nats-private-host>:4222`,
   `STREAM_CORS_ORIGIN=https://<app-domain>`. Attach `stream.<domain>`.
7. **ingest service** — same repo/image, start command `python -m
   src.ingest.workers.main`. No public domain. Env: `SPORTMONKS_API_TOKEN`,
   `SPORTMONKS_BASE_URL`, `ACTIVE_SEASON_ID` (WC2026), `DATABASE_URL` (same DB),
   `INGEST_NATS_SERVERS=nats://<nats-private-host>:4222`. Optional cadence
   overrides: `INGEST_INPLAY_POLL_SECONDS`, etc.
8. **Resend** — verify `<domain>` (add the DNS records Resend shows). Put the
   API key in the api service as `RESEND_API_KEY`, set `EMAIL_FROM` to a
   verified address.
9. **Migrations** run automatically on api boot (`alembic upgrade head`). For a
   fresh DB you then need to **bootstrap reference data** (teams/players/
   fixtures) — see `backend/` CLI. The ingest daemon then keeps live fixtures
   updated during matches.

## Notes / open items

- **Live prices are real**: the ingest daemon polls Sportmonks during matches
  and publishes ticks → worker → browser. Requires a valid paid
  `SPORTMONKS_API_TOKEN` with `livescores/inplay` access (confirmed available).
- Single api replica ⇒ migrate-on-boot is safe. If you scale to >1 replica,
  move migrations to a one-off release step instead.
- Local dev is unchanged: no `WEB_DIST_DIR` ⇒ FastAPI serves API only, Vite
  serves the SPA on :5173; local DB keeps TimescaleDB.
