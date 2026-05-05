"""TeamRepository — Port (interface) for Team persistence.

DDD role: Repository port. Lives in the domain because the abstraction belongs
to the domain; the adapter implementation lives in infrastructure/.

Following ISP: only the methods needed today. Add more on demand (Rule of Three).
"""

from typing import Protocol

from src.domain.team.team import Team


class TeamRepository(Protocol):
    async def upsert(self, team: Team, *, sportmonks_id: int | None = None) -> None: ...

    async def list_all(self) -> list[Team]: ...

    async def get_by_id(self, team_id: str) -> Team | None: ...
