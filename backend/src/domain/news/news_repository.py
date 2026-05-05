"""NewsRepository — Port."""

from typing import Protocol

from src.domain.news.news import News


class NewsRepository(Protocol):
    async def upsert_by_sportmonks_id(self, news: News, *, sportmonks_id: int) -> None: ...

    async def list_recent(self, *, limit: int = 20) -> list[News]: ...

    async def list_by_fixture(self, fixture_id: int) -> list[News]: ...

    async def list_by_team(self, team_id: str, *, limit: int = 50) -> list[News]: ...
