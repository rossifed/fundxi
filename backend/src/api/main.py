import logging
import os
from pathlib import Path

import sentry_sdk
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.api.routers import (
    announcements,
    auth,
    fixtures,
    leagues,
    news,
    players,
    portfolio,
    standings,
    teams,
    valuations,
)
from src.config import get_settings


def _configure_observability() -> None:
    """Wire logging + error tracking before the app handles any request.

    - structlog: JSON in deployments (machine-parseable, Atonra convention),
      human-readable console in dev.
    - Sentry: initialised only when ``SENTRY_DSN`` is set, so dev and tests stay
      offline. The FastAPI integration is auto-enabled by the SDK.
    """
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper(), format="%(message)s")
    renderer = structlog.dev.ConsoleRenderer() if settings.is_dev else structlog.processors.JSONRenderer()
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            renderer,
        ]
    )
    if settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.app_env,
            # Errors only by default — no perf sampling, keeps the free tier safe.
            traces_sample_rate=0.0,
        )


_configure_observability()

app = FastAPI(title="fundXI Backend", version="0.1.0")

# CORS origins are env-driven so prod can allow its real web origin without a
# code change. Comma-separated list in CORS_ALLOW_ORIGINS; defaults to local
# dev. When the SPA is served by this same app (WEB_DIST_DIR set) it is
# same-origin and needs no CORS entry — the list still matters for the
# separate streaming-worker origin and any other client.
_cors_origins = [
    o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(announcements.router)
app.include_router(teams.router)
app.include_router(players.router)
app.include_router(fixtures.router)
app.include_router(valuations.router)
app.include_router(news.router)
app.include_router(portfolio.router)
app.include_router(standings.router)
app.include_router(leagues.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# Public privacy policy (App Store / TestFlight require a reachable URL). Served by
# the API so it is live at https://<host>/privacy regardless of the SPA — declared
# BEFORE the SPA catch-all below so it is not swallowed by index.html.
@app.get("/privacy", include_in_schema=False)
async def privacy_policy() -> FileResponse:
    return FileResponse(Path(__file__).parent / "legal" / "privacy.html")


# --- Static web (production) -------------------------------------------------
# When WEB_DIST_DIR points at a built SPA (the prod Docker image copies
# apps/web/dist there), this app serves the frontend too — same origin as the
# API, so the session cookie works with zero CORS/SameSite tuning. In local dev
# the var is unset and this block is a no-op (Vite serves the SPA on :5173).
# Registered AFTER the API routers so /api, /health, /streams win; everything
# else falls back to index.html for client-side routing (e.g. /reset-password).
_web_dist_env = os.environ.get("WEB_DIST_DIR")
if _web_dist_env and Path(_web_dist_env).is_dir():
    _web_dist = Path(_web_dist_env).resolve()
    _assets = _web_dist / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        # Serve the real file when it exists (favicon, images, …); otherwise
        # return index.html so the SPA router handles the route. Guard against
        # path traversal by ensuring the resolved path stays inside the dist.
        candidate = (_web_dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(_web_dist):
            return FileResponse(candidate)
        return FileResponse(_web_dist / "index.html")
