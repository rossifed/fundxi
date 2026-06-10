"""Auth service — register, login, me.

DDD role: Application Service. Orchestrates domain (Email/Password
value objects), infra adapters (password hashing, user/portfolio
repos) and business rules ("email already exists" etc.). The HTTP
shape is the router's concern, not this file's.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.application.provision_portfolio import provision_portfolio
from src.domain.auth.auth import Email, Password
from src.domain.portfolio.user import UserKind
from src.infrastructure.db.models.user import UserORM
from src.infrastructure.db.repositories.league import SqlAlchemyLeagueRepository
from src.infrastructure.db.repositories.user import SqlAlchemyUserRepository
from src.infrastructure.security.passwords import dummy_verify, hash_password, verify_password


class EmailAlreadyExistsError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    id: int
    email: str
    name: str


async def register_user(
    session: AsyncSession,
    *,
    email: Email,
    password: Password,
    display_name: str | None = None,
) -> AuthenticatedUser:
    """Create a new human user with a starter portfolio.

    Raises ``EmailAlreadyExistsError`` on conflict on email."""
    user_repo = SqlAlchemyUserRepository(session)

    existing = await session.execute(select(UserORM).where(UserORM.email == email.value))
    if existing.scalar_one_or_none() is not None:
        raise EmailAlreadyExistsError(email.value)

    # Display name defaults to the email's local part; ensure uniqueness.
    base_name = (display_name or email.value.split("@")[0])[:48]
    name = base_name
    suffix = 1
    while True:
        clash = await session.execute(select(UserORM).where(UserORM.name == name))
        if clash.scalar_one_or_none() is None:
            break
        suffix += 1
        name = f"{base_name}-{suffix}"[:64]

    user = await user_repo.create(name=name, kind=UserKind.HUMAN)
    # Starter portfolio + opening snapshot — the "1 user = 1 portfolio" invariant,
    # shared with the self-healing get-or-create on read. Same session ⇒ atomic.
    await provision_portfolio(session, user.id)
    await session.execute(
        update(UserORM)
        .where(UserORM.id == user.id)
        .values(email=email.value, password_hash=hash_password(password.value))
    )

    # Every user is a member of the global league from day one.
    league_repo = SqlAlchemyLeagueRepository(session)
    global_league = await league_repo.get_global()
    if global_league is not None:
        await league_repo.add_member(league_id=global_league.id, user_id=user.id)

    await session.commit()

    return AuthenticatedUser(id=user.id, email=email.value, name=name)


async def login_user(
    session: AsyncSession,
    *,
    email: Email,
    password: Password,
) -> AuthenticatedUser:
    """Verify credentials and return the authenticated user.

    Raises ``InvalidCredentialsError`` for both unknown-email and
    wrong-password (no enumeration leak)."""
    row = await session.execute(select(UserORM).where(UserORM.email == email.value))
    user = row.scalar_one_or_none()
    if user is None or user.password_hash is None:
        # Spend the same bcrypt time as a real verify so the response timing
        # doesn't reveal whether the email is registered (no enumeration).
        dummy_verify(password.value)
        raise InvalidCredentialsError()
    if not verify_password(password.value, user.password_hash):
        raise InvalidCredentialsError()
    return AuthenticatedUser(id=user.id, email=user.email or "", name=user.name)


async def get_user_by_id(session: AsyncSession, user_id: int) -> AuthenticatedUser | None:
    row = await session.execute(select(UserORM).where(UserORM.id == user_id))
    user = row.scalar_one_or_none()
    if user is None:
        return None
    return AuthenticatedUser(id=user.id, email=user.email or "", name=user.name)
