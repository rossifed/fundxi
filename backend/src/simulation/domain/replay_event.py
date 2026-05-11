"""A single timeline entry to be replayed.

DDD role: Value Object. Carries (minute, extra_minute, sequence) — the
ordering keys universal to any match timeline — plus an opaque
provider payload. The domain only inspects the ordering keys; the
infrastructure adapters at both ends (reader, sink) own knowledge of
the payload schema.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from enum import Enum
from typing import Any


class ReplayEventKind(Enum):
    """What the payload represents.

    ``MATCH_COMMENT`` carries a Sportmonks per-minute commentary entry;
    ``MATCH_EVENT`` carries a structured match event (goal, card,
    substitution, etc.). Additional kinds (lineups, stat updates) are
    added in later slices without breaking existing membership.
    """

    MATCH_COMMENT = "match_comment"
    MATCH_EVENT = "match_event"


@dataclass(frozen=True, slots=True)
class ReplayEvent:
    kind: ReplayEventKind
    minute: int
    extra_minute: int | None
    sequence: int
    payload: Mapping[str, Any]
