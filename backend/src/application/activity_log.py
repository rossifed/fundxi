"""record_activity — best-effort user-activity capture (Application service).

Runs as a FastAPI background task AFTER the response, in its OWN DB session, with
errors swallowed: behaviour analytics must never break or slow a request.
``user_id`` None = anonymous. ``user_agent`` is truncated to the column width.
See ActivityEventORM / migration 0040.
"""

import structlog

from src.infrastructure.db.repositories.activity_event import SqlAlchemyActivityEventRepository
from src.infrastructure.db.session import SessionLocal

log = structlog.get_logger(__name__)

# Event kinds captured today (extend as needed).
OPEN = "open"
LOGIN = "login"
REGISTER = "register"


async def record_activity(*, kind: str, user_id: int | None, user_agent: str | None) -> None:
    try:
        async with SessionLocal() as session:
            await SqlAlchemyActivityEventRepository(session).record(
                kind=kind,
                user_id=user_id,
                user_agent=((user_agent or "")[:300] or None),
            )
            await session.commit()
    except Exception as exc:
        # Broad on purpose: a secondary projection must never affect the request.
        log.warning("activity.record_failed", kind=kind, error=str(exc))
