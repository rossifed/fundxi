"""TeamRepository — Port (interface) for Team persistence.

DDD role: Repository port. Lives in the domain because the abstraction belongs
to the domain; the adapter implementation lives in infrastructure/.

Following ISP: only the methods needed today. Add more on demand (Rule of Three).
"""

from typing import Protocol

from src.domain.team.team import Team


class TeamRepository(Protocol):
    async def upsert(
        self, team: Team, *, sportmonks_id: int | None = None, coach_id: int | None = None
    ) -> str:
        """Persist the team and return its EFFECTIVE internal id — the id the
        row actually carries after the write. Usually ``team.id``, but when the
        team already exists under a different id for the same sportmonks_id
        (provider short_code changed), the stored id is kept and returned so
        callers reference the team by an id that really exists (FK safety)."""
        ...

    async def list_all(self) -> list[Team]: ...

    async def get_by_id(self, team_id: str) -> Team | None: ...
