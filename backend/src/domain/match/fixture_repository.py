"""FixtureRepository — Port for Fixture persistence.

DDD role: Repository port.
"""

from typing import Protocol

from src.domain.match.fixture import Fixture, FixtureStatus


class FixtureRepository(Protocol):
    async def upsert_by_sportmonks_id(self, fixture: Fixture, *, sportmonks_id: int) -> None: ...

    async def list_all(self) -> list[Fixture]: ...

    async def get_by_id(self, fixture_id: int) -> Fixture | None: ...

    async def list_by_status(self, status: FixtureStatus) -> list[Fixture]: ...

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]: ...
