"""Live ingestion bounded context.

This package drives data INTO the live store from real-time sources
(Sportmonks REST polling, RSS feeds, etc.). It is the production-side
twin of ``src/simulation/`` (which drives from a recorded archive).

Both bounded contexts share the same projection pipeline (entities
defined in ``src/domain/``, projectors in
``src/infrastructure/sportmonks/projectors/``, repositories in
``src/infrastructure/db/``); they differ only in **where the raw
payload comes from**.

Architecture invariants:
  - The supervisor owns one asyncio task per active fixture poller,
    plus one task per side poller (standings, news, reference).
  - Each task is independent: an error or backpressure in one never
    blocks another.
  - Polling frequencies and concurrency bounds live in
    ``ingest.domain.settings`` and are configurable through env vars
    (``INGEST_*``) without code changes.
  - HTTP-side work uses ``asyncio.gather`` to project each include
    branch in parallel for the SAME payload.
"""
