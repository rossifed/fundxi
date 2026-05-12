"""fundXI streaming service — Server-Sent Events over the NATS bus.

DDD role: Adapter (driving). A standalone FastAPI app that connects
to NATS once at startup, fans every message out through the
``NotifyHub``, and exposes per-topic SSE endpoints.

Endpoints (all ``text/event-stream``):
  GET /streams/fixture/{fixture_id}
      events + comments + status + lineup + per-player stats for one
      fixture — drives the MatchView.
  GET /streams/player/{player_id}
      that player's price ticks — drives the PlayerSheet chart.
  GET /streams/prices
      every player's price ticks — the Portfolio page subscribes here
      and ignores ticks for players it doesn't hold.
  GET /streams/news        — news refreshed (drives the Home feed).
  GET /streams/standings   — group tables refreshed.

Each frame is ``event: update\\ndata: <json-payload>\\n\\n``; the
client treats it as a hint to re-fetch the affected resource from the
BFF (the SSE stream carries deltas, not the source of truth). A
``: keepalive`` comment is sent every ``STREAM_HEARTBEAT_SECONDS`` to
defeat proxy idle-timeouts. On client disconnect the subscriber queue
is released.

Run with:
    uv run uvicorn src.streaming.workers.app:app --port 8002
"""

import asyncio
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from src.streaming.application.hub import NotifyHub
from src.streaming.domain.settings import StreamingSettings
from src.streaming.infrastructure.nats_notification_source import NatsNotificationSource
from src.streaming.infrastructure.sse import sse_comment, sse_event

log = structlog.get_logger(__name__)


def _configure_logging() -> None:
    logging.basicConfig(level="INFO", format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer(),
        ]
    )


_settings = StreamingSettings()


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncGenerator[None]:
    _configure_logging()
    hub = NotifyHub(maxsize=_settings.subscriber_queue_size)
    app.state.hub = hub
    log.info("streaming.start", nats_servers=_settings.nats_server_list, subject=_settings.nats_subject)
    async with NatsNotificationSource(servers=_settings.nats_server_list) as source:
        await source.subscribe(_settings.nats_subject, hub.dispatch)
        yield
    log.info("streaming.stopped")


app = FastAPI(title="fundXI Streaming", version="0.1.0", lifespan=_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_settings.cors_origin],
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _hub(request: Request) -> NotifyHub:
    hub = getattr(request.app.state, "hub", None)
    if not isinstance(hub, NotifyHub):  # pragma: no cover — lifespan always sets it
        raise RuntimeError("NotifyHub not initialised")
    return hub


async def _topic_stream(request: Request, *, topic: str) -> StreamingResponse:
    hub = _hub(request)
    queue = hub.subscribe(topic)
    log.info("streaming.subscribe", topic=topic, subscribers=hub.subscriber_count(topic))

    async def generator() -> AsyncIterator[str]:
        try:
            yield sse_event(event="connected", data="{}")
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=_settings.heartbeat_seconds)
                except TimeoutError:
                    yield sse_comment("keepalive")
                    continue
                yield sse_event(event="update", data=payload.decode())
        finally:
            hub.unsubscribe(topic, queue)
            log.info("streaming.unsubscribe", topic=topic, subscribers=hub.subscriber_count(topic))

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/streams/fixture/{fixture_id}")
async def stream_fixture(fixture_id: int, request: Request) -> StreamingResponse:
    return await _topic_stream(request, topic=f"fixture:{fixture_id}")


@app.get("/streams/player/{player_id}")
async def stream_player(player_id: int, request: Request) -> StreamingResponse:
    return await _topic_stream(request, topic=f"player:{player_id}")


@app.get("/streams/prices")
async def stream_prices(request: Request) -> StreamingResponse:
    return await _topic_stream(request, topic="prices")


@app.get("/streams/news")
async def stream_news(request: Request) -> StreamingResponse:
    return await _topic_stream(request, topic="news")


@app.get("/streams/standings")
async def stream_standings(request: Request) -> StreamingResponse:
    return await _topic_stream(request, topic="standings")


@app.get("/healthz")
async def healthz(request: Request) -> dict[str, object]:
    hub = _hub(request)
    return {"status": "ok", "topics": hub.topic_count()}
