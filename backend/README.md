# fundXI Backend

Python + FastAPI + Postgres (TimescaleDB) backend for fundXI.
Feeds the frontend with WC2026 data ingested from Sportmonks
and a live valuation engine.

## Quickstart

```bash
cp .env.example .env
docker compose up -d
uv sync
uv run alembic upgrade head
uv run uvicorn src.api.main:app --reload
```

## Layout

```
src/
├── domain/         pure-Python entities (mirror frontend domain/)
├── application/    use cases / services
├── api/            FastAPI routers (mirror frontend api/ surface)
├── infrastructure/
│   ├── db/         SQLAlchemy models + repositories
│   ├── sportmonks/ HTTP client
│   └── workers/    bootstrap, live ingest, valuation, backfill
└── valuation/      pluggable valuation strategies
```

See the architecture plan for full design rationale.
