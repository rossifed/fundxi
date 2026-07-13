"""sync_fixture_events — full-set reconciliation of a fixture's event timeline.

DDD role: Application Service / Use Case.

Sportmonks' ``/fixtures/{id}?include=events`` payload is the COMPLETE event
set for the fixture at that instant — not a delta. During live coverage the
provider emits provisional events (often with ``player_id`` null), later
replaces them under NEW ids, and REMOVES events rescinded by VAR. An
upsert-only ingestion therefore accumulates duplicates and phantoms (measured
in prod: cards duplicated up to x11, VAR spam x26, disallowed goals kept —
see backend/analysis/player-stats-sanitization-audit.md).

This use case makes the stored timeline converge to the feed on every call:
  1. upsert every projectable event of the payload;
  2. delete stored events whose ``sportmonks_id`` is absent from the payload.

Presence is judged on the RAW payload ids (not just the projectable ones): an
event we fail to project is still in the feed, so its stored version — if any —
must survive rather than be wrongly deleted.

Empty-feed guard: when the payload carries ZERO events we upsert nothing and
DELETE NOTHING. A transient provider glitch returning an empty array must
never erase an existing timeline (the next poll would restore it, but a
settlement reading the emptied window would miss suspensions). The trade-off —
a feed legitimately emptied of its single provisional event keeps it one poll
longer — is accepted and self-heals on the next non-empty poll.

Idempotent: replaying the same payload is a no-op.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import structlog

from src.domain.match.match_event import MatchEventRepository
from src.infrastructure.sportmonks.projectors.match_event import project_match_event

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class EventSyncReport:
    upserted: int
    deleted: int


async def sync_fixture_events(
    *,
    event_repo: MatchEventRepository,
    fixture_id: int,
    events_payload: Sequence[dict[str, Any]],
    player_id_by_sportmonks: dict[int, int],
    team_id_by_sportmonks: dict[int, str],
) -> EventSyncReport:
    """Converge ``core.match_event`` for this fixture to the provider feed."""
    present_ids = {payload["id"] for payload in events_payload if isinstance(payload.get("id"), int)}
    if not present_ids:
        return EventSyncReport(upserted=0, deleted=0)

    upserted = 0
    for payload in events_payload:
        try:
            event, smk_id = project_match_event(
                payload,
                fixture_id=fixture_id,
                player_id_by_sportmonks=player_id_by_sportmonks,
                team_id_by_sportmonks=team_id_by_sportmonks,
            )
        except (ValueError, TypeError) as exc:
            log.debug("sync_fixture_events.event_skip", fixture_id=fixture_id, reason=str(exc))
            continue
        await event_repo.upsert_by_sportmonks_id(event, sportmonks_id=smk_id)
        upserted += 1

    deleted = await event_repo.delete_absent_from_feed(fixture_id, present_sportmonks_ids=present_ids)
    if deleted:
        log.info("sync_fixture_events.pruned", fixture_id=fixture_id, deleted=deleted)
    return EventSyncReport(upserted=upserted, deleted=deleted)
