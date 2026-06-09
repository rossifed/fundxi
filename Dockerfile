# syntax=docker/dockerfile:1
#
# Production image for fundXI — builds the web SPA and serves it from the same
# FastAPI process as the API (single origin → the session cookie works with no
# CORS/SameSite tuning). The SAME image runs the streaming worker: the worker
# service just overrides the start command (see deploy/README).
#
# Build context = repo root (the web build needs the npm workspace:
# packages/core + apps/web).

# --- Stage 1: build the web SPA ---------------------------------------------
FROM node:22-slim AS web
WORKDIR /repo
# Copy the workspace manifests + sources. apps/ includes mobile, but
# --ignore-scripts skips its native postinstall hooks (not needed for the web
# build) and we only build the web workspace.
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --ignore-scripts
# Vite inlines VITE_* at build time. Empty VITE_API_URL ⇒ the SPA calls the
# API on its OWN origin (same host) — exactly what we want when this image
# serves both. VITE_STREAM_URL points at the separate streaming service.
ARG VITE_API_URL=""
ARG VITE_STREAM_URL=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_STREAM_URL=$VITE_STREAM_URL
RUN npm run build --workspace apps/web

# --- Stage 2: python runtime (API + web) ------------------------------------
FROM python:3.12-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
# Install deps first (cached layer). package = false ⇒ uv only builds the venv.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
# App code + alembic + the built SPA.
COPY backend/ ./
COPY --from=web /repo/apps/web/dist ./web
ENV WEB_DIST_DIR=/app/web
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
# API service: run migrations, then serve. Single replica ⇒ safe to migrate on
# boot. The streaming-worker service overrides this CMD with:
#   uvicorn src.streaming.workers.app:app --host 0.0.0.0 --port ${PORT:-8000}
CMD ["sh", "-c", "alembic upgrade head && uvicorn src.api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
