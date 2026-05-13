"""Publish a fixture-status notification on the bus.

DDD role: tiny wiring utility. Called by the CLI / GUI once a replay
ends and the fixture row has been committed back to ``finished``, so
subscribed browsers refetch one last time — the MatchView shows the
final state and the Home "Match Center" card clears. Publish failures
are swallowed (the DB holds the truth).
"""

import json

import structlog

from src.domain.messaging import NotificationPublisher

log = structlog.get_logger(__name__)


async def publish_fixture_status(publisher: NotificationPublisher, *, fixture_internal_id: int, status: str) -> None:
    subject = f"fundxi.fixture_status.{fixture_internal_id}"
    payload = json.dumps({"kind": "fixture_status", "fixture_id": fixture_internal_id, "status": status}).encode()
    try:
        await publisher.publish(subject, payload)
    except Exception as exc:
        log.warning("simulation.nats.fixture_status_publish_failed", subject=subject, error=str(exc))
