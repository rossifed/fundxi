"""Tunable knobs of the streaming bounded context.

DDD role: Configuration (read-only Value Object). Override via
``STREAM_*`` environment variables or ``.env``.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class StreamingSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="STREAM_", env_file=".env", extra="ignore")

    # NATS server URL(s). Comma-separated for cluster mode (later).
    nats_servers: str = "nats://localhost:4222"
    # Wildcard subject the hub subscribes to.
    nats_subject: str = "fundxi.>"

    # Max messages buffered per SSE subscriber. A client that can't keep
    # up overflows this and is dropped (the browser auto-reconnects and
    # re-fetches state).
    subscriber_queue_size: int = 100
    # Seconds between SSE keep-alive comments (anti proxy idle-timeout).
    heartbeat_seconds: float = 25.0

    # CORS origin for the frontend dev server.
    cors_origin: str = "http://localhost:5173"

    @property
    def nats_server_list(self) -> tuple[str, ...]:
        return tuple(s.strip() for s in self.nats_servers.split(",") if s.strip())
