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

    Slice 1 only handles ``MATCH_COMMENT``. Additional kinds
    (match events, lineups, stat updates) are added in later slices
    without breaking this enum's existing membership.
    """

    MATCH_COMMENT = "match_comment"


@dataclass(frozen=True, slots=True)
class ReplayEvent:
    kind: ReplayEventKind
    minute: int
    extra_minute: int | None
    sequence: int
    payload: Mapping[str, Any]
