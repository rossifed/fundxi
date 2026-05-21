"""FixtureRepository — Port for Fixture persistence.

DDD role: Repository port.
"""

from typing import Protocol

from src.domain.match.fixture import Fixture, FixtureStatus


class FixtureRepository(Protocol):
    async def upsert_by_sportmonks_id(self, fixture: Fixture, *, sportmonks_id: int) -> None: ...

    async def list_all(self, *, season_id: int | None = None) -> list[Fixture]: ...

    async def get_by_id(self, fixture_id: int) -> Fixture | None: ...

    async def list_by_status(self, status: FixtureStatus, *, season_id: int | None = None) -> list[Fixture]: ...

    async def map_sportmonks_to_internal_id(self) -> dict[int, int]: ...

    async def set_kit_colors(
        self,
        *,
        sportmonks_id: int,
        home_kit_color: str | None,
        away_kit_color: str | None,
        home_kit_palette: str | None,
        away_kit_palette: str | None,
    ) -> None:
        """Update the per-match kit-color columns. No-op if the fixture is unknown."""
        ...

    async def set_formations(
        self,
        *,
        sportmonks_id: int,
        home_formation: str | None,
        away_formation: str | None,
    ) -> None:
        """Update the per-match tactical formation. No-op if the fixture is unknown."""
        ...

    async def set_venue_and_phase(
        self,
        *,
        sportmonks_id: int,
        venue_id: int | None,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        """Update the venue link and tournament phase labels. No-op if the fixture is unknown."""
        ...

    async def set_phase(
        self,
        *,
        sportmonks_id: int,
        stage_name: str | None,
        round_name: str | None,
    ) -> None:
        """Update ONLY the tournament phase labels (stage / round), leaving
        the venue link untouched. No-op if the fixture is unknown."""
        ...
