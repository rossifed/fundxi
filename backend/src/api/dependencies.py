"""FastAPI dependencies — wire concrete adapters to ports.

DDD role: Composition root for the HTTP layer. Each request gets fresh repos
bound to a fresh AsyncSession.
"""

from collections.abc import AsyncIterator

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import get_settings
from src.domain.valuation.valuation_provider import ValuationProvider
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.fixture import SqlAlchemyFixtureRepository
from src.infrastructure.db.repositories.match_comment import SqlAlchemyMatchCommentRepository
from src.infrastructure.db.repositories.news import SqlAlchemyNewsRepository
from src.infrastructure.db.repositories.player import SqlAlchemyPlayerRepository
from src.infrastructure.db.repositories.standings import SqlAlchemyStandingRepository
from src.infrastructure.db.repositories.team import SqlAlchemyTeamRepository
from src.infrastructure.db.session import SessionLocal
from src.infrastructure.security.jwt_tokens import JwtIssuer
from src.infrastructure.valuation.engine_valuation_provider import EngineValuationProvider


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


SESSION_COOKIE = "fundxi_session"


async def resolve_session_user_id(request: Request, session: AsyncSession) -> int | None:
    """Validate the session cookie and return the user id, or ``None``.

    Beyond the JWT signature/expiry, the token is rejected if it was issued
    *before* the user's ``password_changed_at`` — so a password reset
    invalidates every previously minted session, not just the active one.
    Shared by ``get_current_user_id`` (raises 401) and ``/auth/me`` (returns
    anonymous)."""
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    claims = JwtIssuer(secret=get_settings().jwt_secret).verify_claims(token)
    if claims is None:
        return None
    row = await session.execute(
        select(UserORM.password_changed_at).where(UserORM.id == claims.user_id)
    )
    changed_at = row.scalar_one_or_none()
    if changed_at is not None and claims.issued_at < int(changed_at.timestamp()):
        return None
    return claims.user_id


async def get_current_user_id(
    request: Request, session: AsyncSession = Depends(get_session)
) -> int:
    """Resolve the JWT in the ``fundxi_session`` cookie → user id.
    Raises 401 if missing, invalid, expired, or superseded by a password
    reset. Use for routes that REQUIRE auth (portfolio, trades, leagues
    create/join, etc.). Public routes don't take this dependency."""
    user_id = await resolve_session_user_id(request, session)
    if user_id is None:
        raise HTTPException(status_code=401, detail="not authenticated")
    return user_id


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
