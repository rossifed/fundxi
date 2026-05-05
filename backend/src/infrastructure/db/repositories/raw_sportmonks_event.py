"""SqlAlchemyRawSportmonksEventRepository — audit/replay archive.

DDD role: Infrastructure-only Adapter (raw events are not a domain concept).
No Protocol port: a single implementation today, mockable via duck-typing.

Idempotent on (endpoint, response_hash): re-ingesting the same payload is a
no-op and returns False.
"""

import hashlib
import json
from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.db.models.raw_sportmonks_event import RawSportmonksEventORM

# Sportmonks envelopes carry per-call metadata (rate_limit counters, timezone)
# that changes on every request even when the data is byte-identical. We
# exclude those keys from the hash so the (endpoint, response_hash) idempotency
# key holds across re-runs.
_NON_DATA_ENVELOPE_KEYS = frozenset({"rate_limit", "subscription", "timezone"})


def hash_response(response: dict[str, Any]) -> str:
    """SHA-256 of the canonical-JSON-encoded response payload (envelope metadata
    stripped). Pure function."""
    payload = {k: v for k, v in response.items() if k not in _NON_DATA_ENVELOPE_KEYS}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class SqlAlchemyRawSportmonksEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def insert_if_new(
        self,
        *,
        endpoint: str,
        params: dict[str, Any],
        response: dict[str, Any],
    ) -> bool:
        """Insert the event. Returns True if newly inserted, False if duplicate."""
        stmt = (
            pg_insert(RawSportmonksEventORM)
            .values(
                endpoint=endpoint,
                params=params,
                response=response,
                response_hash=hash_response(response),
            )
            .on_conflict_do_nothing(constraint="uq_raw_sportmonks_event_endpoint_hash")
            .returning(RawSportmonksEventORM.id)
        )
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none() is not None
