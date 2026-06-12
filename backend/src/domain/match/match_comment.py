"""MatchComment domain — Entity + Repository port.

DDD role: Entity (per-minute event commentary, sourced from Sportmonks).
"""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class MatchComment:
    id: int
    fixture_id: int  # internal core.fixture.id
    minute: int
    extra_minute: int | None
    comment: str
    is_goal: bool
    is_important: bool
    sequence: int


class MatchCommentRepository(Protocol):
    async def upsert_by_sportmonks_id(self, comment: MatchComment, *, sportmonks_id: int) -> None: ...

    async def reconcile_overturned_goals(self, fixture_id: int) -> int: ...

    async def list_by_fixture(self, fixture_id: int) -> list[MatchComment]: ...

    async def list_by_team(self, team_id: str, *, limit: int = 100) -> list[MatchComment]: ...

    async def list_by_player(self, player_id: int, *, limit: int = 100) -> list[MatchComment]: ...
