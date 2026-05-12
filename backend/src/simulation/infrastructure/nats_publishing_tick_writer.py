"""PlayerPriceTickWriter decorator that mirrors each tick onto the NATS bus.

DDD role: Adapter (driven). Wraps an inner ``PlayerPriceTickWriter``
(the SQLAlchemy one) and, after the tick row is written, publishes a
``fundxi.player_price_tick.<player_id>`` notification — the same one
the live pricing worker emits — so a Streamlit replay drives the
PlayerSheet / Portfolio SSE streams just like a real match.

Publish failures are swallowed (the DB holds the truth; browsers
self-heal on REST refetch).
"""

import json
from dataclasses import dataclass
from datetime import datetime

import structlog

from src.domain.messaging import NotificationPublisher
from src.simulation.domain.ports import PlayerPriceTickWriter

log = structlog.get_logger(__name__)


@dataclass(slots=True)
class NatsPublishingTickWriter:
    inner: PlayerPriceTickWriter
    publisher: NotificationPublisher

    async def insert(
        self,
        *,
        player_id: int,
        ts: datetime,
        fixture_id: int | None,
        current_price: float,
        performance_rating: float,
        change_since_open: float,
    ) -> None:
        await self.inner.insert(
            player_id=player_id,
            ts=ts,
            fixture_id=fixture_id,
            current_price=current_price,
            performance_rating=performance_rating,
            change_since_open=change_since_open,
        )
        subject = f"fundxi.player_price_tick.{player_id}"
        payload = json.dumps(
            {
                "kind": "player_price_tick",
                "player_id": player_id,
                "fixture_id": fixture_id,
                "current_price": current_price,
                "change_since_open": change_since_open,
            }
        ).encode()
        try:
            await self.publisher.publish(subject, payload)
        except Exception as exc:
            log.warning("simulation.nats.tick_publish_failed", subject=subject, error=str(exc))
