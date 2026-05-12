"""FastAPI dependencies — wire concrete adapters to ports.

DDD role: Composition root for the HTTP layer. Each request gets fresh repos
bound to a fresh AsyncSession.
"""

from collections.abc import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository
from src.infrastructure.db.repositories.standings import SqlAlchemyStandingRepository
from src.infrastructure.db.repositories.team import SqlAlchemyTeamRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.valuation.engine_valuation_provider import EngineValuationProvider


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def get_team_repo(session: AsyncSession = Depends(get_session)) -> SqlAlchemyTeamRepository:
    return SqlAlchemyTeamRepository(session)


def get_player_repo(session: AsyncSession = Depends(get_session)) -> SqlAlchemyPlayerRepository:
    return SqlAlchemyPlayerRepository(session)


def get_fixture_repo(session: AsyncSession = Depends(get_session)) -> SqlAlchemyFixtureRepository:
    return SqlAlchemyFixtureRepository(session)


def get_valuation_provider(session: AsyncSession = Depends(get_session)) -> ValuationProvider:
    """Engine provider reads from valuation.player_price_tick (real prices).
    Falls back to deterministic synthetic seed for any player without a tick
    yet — keeps the API responsive even on a fresh DB."""
    return EngineValuationProvider(session)


def get_news_repo(session: AsyncSession = Depends(get_session)) -> SqlAlchemyNewsRepository:
    return SqlAlchemyNewsRepository(session)


def get_match_comment_repo(session: AsyncSession = Depends(get_session)) -> SqlAlchemyMatchCommentRepository:
    return SqlAlchemyMatchCommentRepository(session)


def get_standing_repo(session: AsyncSession = Depends(get_session)) -> SqlAlchemyStandingRepository:
    return SqlAlchemyStandingRepository(session)
