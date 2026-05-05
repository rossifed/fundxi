"""SqlAlchemyNewsRepository — Adapter for the NewsRepository port."""

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.news.news import News, NewsType
from src.infrastructure.db.models.news import NewsORM


def _to_domain(orm: NewsORM) -> News:
    return News(
        id=orm.id,
        fixture_id=orm.fixture_id,
        league_id=orm.league_id,
        title=orm.title,
        type=NewsType(orm.type),
        published_at=orm.published_at,
    )


class SqlAlchemyNewsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def upsert_by_sportmonks_id(self, news: News, *, sportmonks_id: int) -> None:
        stmt = pg_insert(NewsORM).values(
            sportmonks_id=sportmonks_id,
            fixture_id=news.fixture_id,
            league_id=news.league_id,
            title=news.title,
            type=news.type.value,
            published_at=news.published_at,
        )
        update_payload = {
            "fixture_id": stmt.excluded.fixture_id,
            "league_id": stmt.excluded.league_id,
            "title": stmt.excluded.title,
            "type": stmt.excluded.type,
            "published_at": stmt.excluded.published_at,
        }
        stmt = stmt.on_conflict_do_update(index_elements=["sportmonks_id"], set_=update_payload)
        await self._session.execute(stmt)

    async def list_recent(self, *, limit: int = 20) -> list[News]:
        result = await self._session.execute(
            select(NewsORM).order_by(NewsORM.published_at.desc().nulls_last(), NewsORM.id.desc()).limit(limit)
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def list_by_fixture(self, fixture_id: int) -> list[News]:
        result = await self._session.execute(
            select(NewsORM)
            .where(NewsORM.fixture_id == fixture_id)
            .order_by(NewsORM.published_at.desc().nulls_last(), NewsORM.id.desc())
        )
        return [_to_domain(row) for row in result.scalars().all()]

    async def list_by_team(self, team_id: str, *, limit: int = 50) -> list[News]:
        # JOIN news to fixture to find articles where this team is home or away.
        from src.infrastructure.db.models.fixture import FixtureORM

        result = await self._session.execute(
            select(NewsORM)
            .join(FixtureORM, NewsORM.fixture_id == FixtureORM.id)
            .where((FixtureORM.home_team_id == team_id) | (FixtureORM.away_team_id == team_id))
            .order_by(NewsORM.published_at.desc().nulls_last(), NewsORM.id.desc())
            .limit(limit)
        )
        return [_to_domain(row) for row in result.scalars().all()]
